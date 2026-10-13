import {useParams} from 'react-router';
import {Placeholder} from './Placeholder';

export function InspectionPage() {
  const {inspectionId} = useParams();
  return (
    <Placeholder title={`Inspection ${inspectionId}`} story="stories 6 and 7" />
  );
}
