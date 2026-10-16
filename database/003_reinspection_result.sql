-- database/003_reinspection_result.sql
-- Re-inspection result (story 12): reinspection_scheduled -> resolved (passed)
-- or changes_requested (failed). Run once in the Supabase SQL editor, after
-- 002_status_functions.sql. Same rules as 002: the server checks the caller's
-- role first, and a refused step raises P0001 with a message shown as is (409).

create function record_reinspection(
  p_ticket_id bigint,
  p_inspection_id bigint,
  p_outcome reinspection_outcome
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status ticket_status;
  v_reinspection_id bigint;
begin
  if p_outcome = 'pending' then
    raise exception 'Result must be passed or failed' using errcode = 'P0001';
  end if;

  -- Lock the ticket first, in the same order as submit_fix and review_fix.
  select status into v_status
    from ticket
    where ticket_id = p_ticket_id
    for update;
  if not found then
    raise exception 'Ticket not found' using errcode = 'P0001';
  end if;
  if v_status <> 'reinspection_scheduled' then
    raise exception 'This ticket has no re-inspection scheduled'
      using errcode = 'P0001';
  end if;

  -- The visit must be an inspection of the ticket's own store.
  if not exists (
    select 1
      from ticket t
      join inspection found on found.inspection_id = t.inspection_id
      join inspection visit on visit.store_id = found.store_id
      where t.ticket_id = p_ticket_id
        and visit.inspection_id = p_inspection_id
  ) then
    raise exception 'This inspection is not of the ticket''s store'
      using errcode = 'P0001';
  end if;

  -- review_fix added this row when the re-inspection was scheduled.
  select reinspection_id into v_reinspection_id
    from reinspection
    where ticket_id = p_ticket_id and outcome = 'pending'
    order by reinspection_id desc
    limit 1
    for update;
  if not found then
    raise exception 'This ticket has no re-inspection scheduled'
      using errcode = 'P0001';
  end if;

  update reinspection
    set outcome = p_outcome, inspection_id = p_inspection_id
    where reinspection_id = v_reinspection_id;

  update ticket
    set status = case p_outcome
      when 'passed' then 'resolved'::ticket_status
      else 'changes_requested'::ticket_status
    end
    where ticket_id = p_ticket_id;
end;
$$;

-- Access ----------------------------------------------------------------
-- As in 002, only the server, with the secret key, may change a ticket's
-- status.

revoke execute on function
  record_reinspection(bigint, bigint, reinspection_outcome)
  from public, anon, authenticated;

grant execute on function
  record_reinspection(bigint, bigint, reinspection_outcome)
  to service_role;
