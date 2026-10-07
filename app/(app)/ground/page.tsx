import { getMostUrgentDealId } from '@/src/mock';
import { redirect } from 'next/navigation';

export default function GroundPage() {
  redirect(`/ground/${getMostUrgentDealId()}`);
}
