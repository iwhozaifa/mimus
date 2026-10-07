import { createServiceClient } from '@/src/db/service';

export async function canSeeConnectedAccount(
  userId: string,
  connectedAccountId: string,
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('can_see_connected_account', {
    p_account_id: connectedAccountId,
    p_uid: userId,
  });
  if (error) throw error;
  return data;
}
