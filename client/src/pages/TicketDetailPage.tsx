import {useParams} from 'react-router';
import {Placeholder} from './Placeholder';

export function TicketDetailPage() {
  const {ticketId} = useParams();
  return (
    <Placeholder title={`Ticket ${ticketId}`} story="stories 9, 10 and 11" />
  );
}
