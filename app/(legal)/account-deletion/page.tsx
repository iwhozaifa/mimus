import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Delete your account · Mimus' };

const link = 'underline underline-offset-2 hover:text-ink';

// Public, signed-out instructions -- the "web deletion URL" app-store and
// OAuth reviewers ask for. The in-app flow is Settings → Account.
export default function AccountDeletionPage() {
  return (
    <article className="flex flex-col gap-4 leading-relaxed text-ink-muted">
      <h1 className="text-3xl font-semibold text-ink">Deleting your Mimus account</h1>

      <h2 className="mt-4 text-xl font-semibold text-ink">In the app</h2>
      <ol className="list-decimal space-y-1 pl-6">
        <li>
          <Link href="/sign-in?next=/settings/account" className={link}>
            Sign in
          </Link>{' '}
          with your account&apos;s email address.
        </li>
        <li>
          Open the account menu (your initials, top right) and choose <strong>Account</strong>.
        </li>
        <li>
          Under <strong>Delete account</strong>, type <code className="font-mono">delete</code> and
          choose <strong>Delete my account</strong>.
        </li>
      </ol>

      <h2 className="mt-4 text-xl font-semibold text-ink">What gets deleted</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          Every service you connected (Google, Microsoft, Slack, Calendly) is disconnected and
          Mimus&apos;s access is revoked.
        </li>
        <li>
          All data imported from those services is deleted: email, calendar events, Slack messages,
          Calendly bookings, contacts and access tokens.
        </li>
        <li>Your profile, sign-in account and workspace memberships are deleted.</li>
        <li>Any workspace where you are the only member is deleted with everything in it.</li>
      </ul>
      <p>
        Your workspace&apos;s AI usage log keeps its entries for your past questions (model, cost
        and timing, never the question itself), no longer linked to you. Billing records are kept as
        long as tax law requires. See the{' '}
        <Link href="/privacy" className={link}>
          Privacy Policy
        </Link>{' '}
        for full details.
      </p>

      <h2 className="mt-4 text-xl font-semibold text-ink">Can&apos;t sign in?</h2>
      <p>
        Email [TODO: privacy email] from your account&apos;s email address and ask us to delete it.
        We&apos;ll confirm and delete it within 30 days.
      </p>

      <h2 className="mt-4 text-xl font-semibold text-ink">Only removing Google access</h2>
      <p>
        To stop Mimus reading your Google data without deleting your account, choose{' '}
        <strong>Disconnect</strong> on the Connections page (this also deletes the imported data),
        or revoke access from your{' '}
        <a
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noopener noreferrer"
          className={link}
        >
          Google Account permissions
        </a>
        .
      </p>
    </article>
  );
}
