import {useParams} from 'react-router';
import {Placeholder} from './Placeholder';

export function StoreDetailPage() {
  const {storeId} = useParams();
  return <Placeholder title={`Store ${storeId}`} story="stories 2, 3 and 5" />;
}
