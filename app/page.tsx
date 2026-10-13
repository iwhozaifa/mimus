import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { SiteFooter } from '@/components/site-footer';

const SOURCES = [
  {
    name: 'Gmail and Google Calendar',
    detail: 'Read-only. Mimus never sends, changes or deletes email or events.',
  },
  {
    name: 'Microsoft Outlook mail and calendar',
    detail: 'Read-only, the same as Google.',
  },
  {
    name: 'Slack',
    detail: 'Channels you are a member of. Never your direct messages.',
  },
  {
    name: 'Calendly',
    detail: 'Your scheduled bookings, read-only.',
  },
];

const signInButton =
  'inline-flex rounded-md bg-ink px-4 py-2 text-sm font-medium text-ink-foreground transition-colors hover:bg-ink/90';

// The public homepage. It's what Google's OAuth reviewers see, so it says
// what Mimus is and why it reads Gmail and Calendar, and links to the
// Privacy Policy -- signed-in users go straight on to /sky.
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-12 px-6 py-16">
        <section className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold text-ink">Mimus</h1>
          <p className="text-lg text-ink-muted">
            An AI chief-of-staff for founder-led businesses. Mimus reads the email, calendar and
            Slack you connect, so you can ask plain questions like &ldquo;what did Acme say about
            the renewal?&rdquo; and get an answer that links back to the original messages.
          </p>
          <div>
            <Suspense
              fallback={
                <Link href="/sign-in" className={signInButton}>
                  Sign in
                </Link>
              }
            >
              <SignedInRedirect />
            </Suspense>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-ink">What Mimus connects to</h2>
          <ul className="flex flex-col divide-y divide-line-muted rounded-card border border-line-muted bg-paper-raised">
            {SOURCES.map((source) => (
              <li key={source.name} className="flex flex-col gap-0.5 px-5 py-4">
                <span className="font-medium text-ink">{source.name}</span>
                <span className="text-sm text-ink-muted">{source.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3 text-ink-muted">
          <h2 className="text-xl font-semibold text-ink">How Mimus treats your data</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              Each connected account is private to you by default. Your workspace sees it only if
              its visibility is changed.
            </li>
            <li>
              To answer a question, Mimus sends short excerpts of the relevant messages to its AI
              provider. Your data is never used to train AI models, never sold and never used for
              ads.
            </li>
            <li>Disconnecting an account deletes everything Mimus imported from it.</li>
          </ul>
          <p>
            The details are in our{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

async function SignedInRedirect() {
  // Marks this as request-time rendering before getClaims() checks the JWT's
  // expiry against Date.now() -- otherwise Next's prerender analysis flags
  // that clock read as an unstable value, even inside this Suspense boundary.
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (context) {
    redirect('/sky');
  }

  return (
    <Link href="/sign-in" className={signInButton}>
      Sign in
    </Link>
  );
}
