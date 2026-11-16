-- database/007_extension_requests.sql
-- Deadline extensions (stories 17 and 18): a store owner asks for a later
-- deadline with a reason, and an inspector approves or denies it. A request
-- still pending when its ticket is resolved is closed. Run once in the
-- Supabase SQL editor, after 006_inspection_completed.sql. It only adds
-- things, so it is safe to run before the code that uses it is merged.
--
-- Same rules as 002: the functions check the ticket and the request, not who
-- is calling. The server checks the caller's role and store access first and
-- passes their ID. A refused step raises P0001 with a message the server
-- shows as is (a 409).

-- Value lists -----------------------------------------------------------
-- closed: the ticket was resolved before an inspector decided.

create type extension_status as enum ('pending', 'approved', 'denied', 'closed');

-- ExtensionRequest ------------------------------------------------------
-- previous_deadline is the ticket's deadline when the owner asked, so the
-- history still shows it after an approval moves the deadline. The three
-- decision columns stay empty while the request is pending. A closed
-- request only has decided_at, the time its ticket was resolved.

create table extension_request (
  extension_request_id bigint generated always as identity primary key,
  ticket_id bigint not null references ticket (ticket_id),
  previous_deadline date not null,
  requested_deadline date not null,
  reason text not null,
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  status extension_status not null default 'pending',
  decided_by uuid,
  decided_at timestamptz,
  decision_comment text,
  -- Named, so the server can tell the two links to app_user apart.
  constraint extension_request_requested_by_fkey
    foreign key (requested_by) references app_user (user_id),
  constraint extension_request_decided_by_fkey
    foreign key (decided_by) references app_user (user_id),
  -- Only a later date is an extension (AC 17.2).
  constraint later_deadline check (requested_deadline > previous_deadline),
  -- A request always gives a reason (AC 17.3).
  constraint reason_given check (btrim(reason) <> ''),
  -- A decision has a decider and a time, and a pending request has neither.
  -- Nobody decides a closed request, so it only has the time.
  constraint decision_is_complete check (
    case status
      when 'pending' then decided_by is null and decided_at is null
      when 'closed' then decided_by is null and decided_at is not null
      else decided_by is not null and decided_at is not null
    end
  ),
  -- A comment only exists as part of a decision, and a denial needs one
  -- (AC 18.3).
  constraint comment_needs_decision
    check (decision_comment is null or status in ('approved', 'denied')),
  constraint denial_needs_comment
    check (status <> 'denied' or btrim(coalesce(decision_comment, '')) <> '')
);

-- One pending request per ticket (AC 17.4), even if two arrive at once.
create unique index extension_request_one_pending_idx
  on extension_request (ticket_id)
  where status = 'pending';

create index extension_request_ticket_id_idx
  on extension_request (ticket_id);
create index extension_request_requested_by_idx
  on extension_request (requested_by);
create index extension_request_decided_by_idx
  on extension_request (decided_by);

-- Request: a new pending request on an unresolved ticket -----------------

create function request_extension(
  p_ticket_id bigint,
  p_owner_id uuid,
  p_deadline date,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status ticket_status;
  v_deadline date;
  v_request_id bigint;
begin
  -- Lock the ticket, in the same order as the other status functions.
  select status, deadline into v_status, v_deadline
    from ticket
    where ticket_id = p_ticket_id
    for update;
  if not found then
    raise exception 'Ticket not found' using errcode = 'P0001';
  end if;
  if v_status = 'resolved' then
    raise exception 'This ticket is already resolved'
      using errcode = 'P0001';
  end if;
  if exists (
    select 1 from extension_request
      where ticket_id = p_ticket_id and status = 'pending'
  ) then
    raise exception 'An extension request is already waiting'
      using errcode = 'P0001';
  end if;
  if p_deadline is null or p_deadline <= v_deadline then
    raise exception 'New deadline must be after the current one'
      using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Reason is required' using errcode = 'P0001';
  end if;

  insert into extension_request (
    ticket_id, previous_deadline, requested_deadline, reason, requested_by
  )
    values (p_ticket_id, v_deadline, p_deadline, btrim(p_reason), p_owner_id)
    returning extension_request_id into v_request_id;

  return v_request_id;
end;
$$;

-- Decide: approve (the deadline moves) or deny (it stays) ---------------

create function decide_extension(
  p_request_id bigint,
  p_inspector_id uuid,
  p_decision extension_status,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_id bigint;
  v_ticket_status ticket_status;
  v_requested date;
  v_status extension_status;
  v_comment text := nullif(btrim(p_comment), '');
begin
  if p_decision is null or p_decision not in ('approved', 'denied') then
    raise exception 'Decision must be approved or denied'
      using errcode = 'P0001';
  end if;

  select ticket_id into v_ticket_id
    from extension_request
    where extension_request_id = p_request_id;
  if not found then
    raise exception 'No extension request is waiting' using errcode = 'P0001';
  end if;

  -- Lock the ticket first, then the request, as review_fix does.
  select status into v_ticket_status
    from ticket
    where ticket_id = v_ticket_id
    for update;
  -- A resolved ticket's deadline no longer matters, and resolving it closed
  -- the request.
  if v_ticket_status = 'resolved' then
    raise exception 'This ticket is already resolved'
      using errcode = 'P0001';
  end if;
  select status, requested_deadline into v_status, v_requested
    from extension_request
    where extension_request_id = p_request_id
    for update;
  -- A page left open may still show a request that was decided since.
  if v_status <> 'pending' then
    raise exception 'This extension request has already been decided'
      using errcode = 'P0001';
  end if;

  if p_decision = 'denied' and v_comment is null then
    raise exception 'A comment is required to deny a request'
      using errcode = 'P0001';
  end if;

  update extension_request
    set status = p_decision,
        decided_by = p_inspector_id,
        decided_at = now(),
        decision_comment = v_comment
    where extension_request_id = p_request_id;

  -- Only an approval moves the deadline (AC 18.1, 18.2).
  if p_decision = 'approved' then
    update ticket set deadline = v_requested where ticket_id = v_ticket_id;
  end if;
end;
$$;

-- Close: resolving a ticket closes its pending request ------------------
-- review_fix (an approved fix) and record_reinspection (a passed
-- re-inspection) resolve a ticket. This trigger runs inside them, after
-- they have locked the ticket, so the lock order stays ticket then request.
-- Being on the ticket, it also covers any other way a ticket is resolved.

create function close_extension_requests()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update extension_request
    set status = 'closed', decided_at = now()
    where ticket_id = new.ticket_id and status = 'pending';
  return null;
end;
$$;

create trigger close_extension_requests
  after update of status on ticket
  for each row
  when (new.status = 'resolved' and old.status <> 'resolved')
  execute function close_extension_requests();

-- Access ----------------------------------------------------------------
-- As in 001-004, only the Express server, with the secret key, reaches the
-- table and calls the functions.

alter table extension_request enable row level security;

grant select, insert, update, delete on extension_request to service_role;

-- The trigger function is never called directly, so nobody gets it.
revoke execute on function
  request_extension(bigint, uuid, date, text),
  decide_extension(bigint, uuid, extension_status, text),
  close_extension_requests()
  from public, anon, authenticated;

grant execute on function
  request_extension(bigint, uuid, date, text),
  decide_extension(bigint, uuid, extension_status, text)
  to service_role;
