import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { InviteForm } from './invite-form';
import { RemoveButton } from './remove-button';
import { RoleSelect } from './role-select';

export default function MembersPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Loading…</p>}>
      <MembersList />
    </Suspense>
  );
}

async function MembersList() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          href="/sign-in?next=/members"
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          Sign in
        </Link>
      </div>
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
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">Members</h1>
        <ul className="flex flex-col gap-3">
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
                className="flex items-center justify-between gap-4 rounded-md border border-slate-200 p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-slate-800">
                    {emailByUserId.get(member.user_id) ?? member.user_id}
                  </span>
                  <span className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium capitalize text-indigo-700">
                    {member.role}
                  </span>
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
            <li className="text-sm text-slate-500">No members yet.</li>
          )}
        </ul>
      </div>
      {(viewerRole === 'owner' || viewerRole === 'manager') && (
        <InviteForm viewerRole={viewerRole} />
      )}
    </div>
  );
}
