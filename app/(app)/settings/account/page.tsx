import { getAccountDeletionBlockers } from '@/src/server/account/deleteAccount';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { DeleteAccountForm } from './delete-account-form';

export default function AccountPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
      <AccountSettings />
    </Suspense>
  );
}

async function AccountSettings() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return (
      <Card>
        <Link
          href="/sign-in?next=/settings/account"
          className="font-medium text-accent-strong hover:text-accent"
        >
          Sign in
        </Link>
      </Card>
    );
  }

  const blockers = await getAccountDeletionBlockers(context.userId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Account</h1>
        <p className="mt-1 text-sm text-ink-muted">Signed in as {context.email}</p>
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Delete account</h2>
        <div className="mt-2 mb-4 flex flex-col gap-2 text-sm text-ink-muted">
          <p>This permanently deletes:</p>
          <ul className="list-disc pl-5">
            <li>
              every service you connected, with Mimus&apos;s access revoked and its imported mail,
              events, contacts and tokens deleted
            </li>
            <li>your profile and workspace memberships</li>
            <li>any workspace where you are the only member, with everything in it</li>
          </ul>
          <p>
            Your teammates&apos; own data isn&apos;t affected. This can&apos;t be undone. See the{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
              Privacy Policy
            </Link>{' '}
            for details.
          </p>
        </div>

        {blockers.length > 0 && (
          <div
            role="alert"
            className="mb-4 rounded-md bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            <p className="mb-1 font-medium">Before you can delete your account:</p>
            <ul className="list-disc pl-5">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        )}

        <DeleteAccountForm disabled={blockers.length > 0} />
      </Card>
    </div>
  );
}
