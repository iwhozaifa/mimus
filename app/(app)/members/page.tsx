import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { InviteForm } from './invite-form';
import { RemoveButton } from './remove-button';
import { RoleSelect } from './role-select';

export default function MembersPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
      <MembersList />
    </Suspense>
  );
}

async function MembersList() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return (
      <Card>
        <Link
          href="/sign-in?next=/members"
          className="font-medium text-accent-strong hover:text-accent"
        >
          Sign in
        </Link>
      </Card>
    );
  }

  const { supabase, workspaceId, userId, role: viewerRole } = context;

  const { data: members } = await supabase
    .from('workspace_members')
    .select('id, user_id, role')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active');

  const userIds = (members ?? []).map((member) => member.user_id);
  const { data: profiles } =
    userIds.length > 0
      ? await supabase.from('profiles').select('id, email').in('id', userIds)
      : { data: [] as { id: string; email: string }[] };

  const emailByUserId = new Map((profiles ?? []).map((profile) => [profile.id, profile.email]));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h1 className="mb-4 text-2xl font-semibold text-ink">Members</h1>
        <ul className="flex flex-col divide-y divide-line-muted">
          {(members ?? []).map((member) => {
            const canManage =
              viewerRole === 'owner'
                ? member.role !== 'owner'
                : viewerRole === 'manager'
                  ? member.role === 'member'
                  : false;
            const showControls = member.user_id !== userId && canManage;

            return (
              <li
                key={member.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-ink">
                    {emailByUserId.get(member.user_id) ?? member.user_id}
                  </span>
                  <Badge variant="accent-soft">{member.role}</Badge>
                </div>
                {showControls && (
                  <div className="flex items-center gap-3">
                    {viewerRole === 'owner' && (
                      <RoleSelect memberId={member.id} role={member.role as 'manager' | 'member'} />
                    )}
                    <RemoveButton memberId={member.id} />
                  </div>
                )}
              </li>
            );
          })}
          {(members ?? []).length === 0 && (
            <li className="text-sm text-ink-muted">No members yet.</li>
          )}
        </ul>
      </Card>
      {(viewerRole === 'owner' || viewerRole === 'manager') && (
        <InviteForm viewerRole={viewerRole} />
      )}
    </div>
  );
}
