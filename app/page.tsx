import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  Check,
  EyeOff,
  Lock,
  Mail,
  MessagesSquare,
  Plug,
  Search,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

// The public landing page. It's also what Google's OAuth reviewers see, so
// it says plainly what Mimus reads, what it can do on your behalf and how
// it treats your data, and links to the Privacy Policy. Signed-in users go
// straight on to /sky.

const WIDTH = 'max-w-6xl';

const primaryButton =
  'inline-flex items-center gap-2 rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-ink-foreground transition-colors hover:bg-ink/85';
const secondaryButton =
  'inline-flex items-center gap-2 rounded-md border border-line-muted bg-paper-raised px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink-faint';

const STEPS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Plug,
    title: 'Connect',
    body: 'Link Gmail, Google Calendar, Outlook, Slack or Calendly. Access is read-only, and each account stays private to you unless you share it.',
  },
  {
    icon: Search,
    title: 'Ask',
    body: 'Ask in plain words, like “what did Acme say about the renewal?”. Every answer links back to the emails and meetings it came from.',
  },
  {
    icon: CalendarCheck,
    title: 'Approve',
    body: 'When someone asks to meet, Mimus drafts a reply with times you’re free. You approve it, and Mimus books the meeting and sends the invite.',
  },
];

const SOURCES: Array<{ icon: LucideIcon; name: string; detail: string }> = [
  {
    icon: Mail,
    name: 'Gmail and Google Calendar',
    detail:
      'Read-only by default. Mimus sends a scheduling reply or books a meeting only if you allow it, and only within the approval level you choose.',
  },
  {
    icon: CalendarDays,
    name: 'Microsoft Outlook mail and calendar',
    detail: 'The same as Google: read-only unless you allow sending and booking.',
  },
  {
    icon: MessagesSquare,
    name: 'Slack',
    detail: 'Channels you are a member of. Never your direct messages.',
  },
  {
    icon: CalendarCheck,
    name: 'Calendly',
    detail: 'Your scheduled bookings and booking link, read-only.',
  },
];

const LEVELS = [
  {
    title: 'Draft only',
    body: 'Mimus writes the reply. You copy it and send it yourself.',
  },
  {
    title: 'Approve every send and booking',
    body: 'Nothing goes out until you say yes. This is where everyone starts.',
    isDefault: true,
  },
  {
    title: 'Offers go out automatically',
    body: 'Replies offering times are sent for you. Bookings still wait for you.',
  },
  {
    title: 'Fully automatic',
    body: 'Mimus replies and books the earliest free time, and shows you what it did.',
  },
];

const PRIVACY: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Lock,
    title: 'Private to you',
    body: 'Each connected account is private by default. Your workspace sees it only if its visibility is changed.',
  },
  {
    icon: EyeOff,
    title: 'Never trains AI',
    body: 'To answer a question, Mimus sends short excerpts to its AI provider. Your data is never used to train AI models, never sold and never used for ads.',
  },
  {
    icon: ShieldCheck,
    title: 'Enforced by the database',
    body: 'Who can see what is enforced inside the database itself, so even Mimus’s AI can only see what you can.',
  },
  {
    icon: Trash2,
    title: 'Gone when you say so',
    body: 'Disconnecting an account deletes everything Mimus imported from it. You can delete your account at any time.',
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <SiteHeader
        width={WIDTH}
        nav={
          <nav aria-label="Sections" className="hidden items-center gap-6 text-sm md:flex">
            <a href="#how" className="text-ink-muted hover:text-ink">
              How it works
            </a>
            <a href="#integrations" className="text-ink-muted hover:text-ink">
              Integrations
            </a>
            <a href="#scheduling" className="text-ink-muted hover:text-ink">
              Scheduling
            </a>
            <a href="#privacy" className="text-ink-muted hover:text-ink">
              Privacy
            </a>
          </nav>
        }
      />

      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Integrations />
        <Scheduling />
        <Privacy />
        <FinalCallToAction />
      </main>

      <SiteFooter width={WIDTH} />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-[28rem] max-w-4xl rounded-full bg-accent/15 blur-3xl"
      />
      <div
        className={`relative mx-auto grid ${WIDTH} items-center gap-12 px-6 py-16 md:py-24 lg:grid-cols-[1.05fr_1fr]`}
      >
        <div className="flex flex-col gap-6">
          <span className="w-fit rounded-pill bg-accent-soft px-3 py-1 text-xs font-medium text-accent-strong">
            An AI chief of staff for founders
          </span>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-ink sm:text-5xl">
            Mimus keeps up with your inbox, so you don’t have to.
          </h1>
          <p className="max-w-xl text-lg text-ink-muted">
            Mimus reads the email, calendar and Slack you connect, answers plain questions with
            links to the original messages, and replies to meeting requests with times you’re free,
            only sending once you approve.
          </p>
          <div className="flex flex-wrap gap-3">
            <Suspense fallback={<GetStarted />}>
              <SignedInRedirect />
            </Suspense>
            <a href="#how" className={secondaryButton}>
              See how it works
            </a>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-muted">
            {['Read-only by default', 'Private to you', 'Never trains AI'].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check className="size-4 text-accent-strong" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <ProductPreview />
      </div>
    </section>
  );
}

function GetStarted() {
  return (
    <Link href="/sign-in" className={primaryButton}>
      Get started
      <ArrowRight className="size-4" aria-hidden />
    </Link>
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

  return <GetStarted />;
}

// An illustration of the product, built from the same tokens as the app
// (not a screenshot), so it follows light and dark mode.
function ProductPreview() {
  return (
    <figure className="relative">
      <figcaption className="sr-only">
        An example: Mimus answers a question with linked sources, and drafts a reply to a meeting
        request that waits for approval.
      </figcaption>
      <div aria-hidden className="flex flex-col gap-4">
        <div className="rounded-card border border-line-muted bg-paper-raised p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 rounded-pill border border-line-muted bg-paper px-4 py-2 text-sm text-ink-muted">
            <Search className="size-4" />
            What did Acme say about the renewal?
          </div>
          <p className="text-sm leading-relaxed text-ink">
            Dana at Acme is happy to renew for two years if the price stays flat, and wants an
            answer by Friday. She also asked to move the review call to next week.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {['Re: Renewal terms · Gmail', 'Acme review · Calendar'].map((source) => (
              <span
                key={source}
                className="rounded-pill bg-accent-soft px-3 py-1 text-xs font-medium text-accent-strong"
              >
                {source}
              </span>
            ))}
          </div>
        </div>

        <div className="ml-6 rounded-card border border-line-muted bg-paper-raised p-5 shadow-sm sm:ml-12">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-ink">Dana wants to meet</span>
            <span className="rounded-pill bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-strong">
              Waiting for you
            </span>
          </div>
          <div className="flex flex-col gap-2 text-sm text-ink-muted">
            {['Tue, 10:00 – 10:30 AM', 'Wed, 2:30 – 3:00 PM', 'Thu, 9:00 – 9:30 AM'].map((slot) => (
              <span key={slot} className="rounded-md border border-line-muted px-3 py-1.5">
                {slot}
              </span>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <span className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-ink-foreground">
              Send these times
            </span>
            <span className="rounded-md px-3 py-1.5 text-xs font-medium text-ink-muted">
              Dismiss
            </span>
          </div>
        </div>
      </div>
    </figure>
  );
}

function SectionHeading({ id, title, lead }: { id: string; title: string; lead: string }) {
  return (
    <div className="mb-10 flex max-w-2xl flex-col gap-3">
      <h2 id={id} className="scroll-mt-24 text-3xl font-semibold tracking-tight text-ink">
        {title}
      </h2>
      <p className="text-ink-muted">{lead}</p>
    </div>
  );
}

function HowItWorks() {
  return (
    <section aria-labelledby="how" className="border-t border-line-muted">
      <div className={`mx-auto ${WIDTH} px-6 py-20`}>
        <SectionHeading
          id="how"
          title="How it works"
          lead="Three steps from a crowded inbox to a clear week."
        />
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-3 rounded-card border border-line-muted bg-paper-raised p-6"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-pill bg-accent-soft text-accent-strong">
                  <step.icon className="size-5" aria-hidden />
                </span>
                <span className="text-sm font-medium text-ink-faint">Step {index + 1}</span>
              </div>
              <h3 className="text-lg font-semibold text-ink">{step.title}</h3>
              <p className="text-sm leading-relaxed text-ink-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Integrations() {
  return (
    <section aria-labelledby="integrations" className="border-t border-line-muted">
      <div className={`mx-auto ${WIDTH} px-6 py-20`}>
        <SectionHeading
          id="integrations"
          title="Works with the tools you already use"
          lead="Connect the accounts you want Mimus to know about. You can disconnect any of them at any time."
        />
        <ul className="grid gap-4 sm:grid-cols-2">
          {SOURCES.map((source) => (
            <li
              key={source.name}
              className="flex gap-4 rounded-card border border-line-muted bg-paper-raised p-6"
            >
              <source.icon className="mt-0.5 size-5 shrink-0 text-accent-strong" aria-hidden />
              <div className="flex flex-col gap-1">
                <span className="font-medium text-ink">{source.name}</span>
                <span className="text-sm leading-relaxed text-ink-muted">{source.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Scheduling() {
  return (
    <section aria-labelledby="scheduling" className="border-t border-line-muted">
      <div className={`mx-auto ${WIDTH} px-6 py-20`}>
        <SectionHeading
          id="scheduling"
          title="Scheduling, on your terms"
          lead="Mimus finds times you’re free across every calendar you connect, or offers your Calendly link. Replies use a fixed template and go only to the person who asked. How much Mimus does on its own is up to you."
        />
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {LEVELS.map((level, index) => (
            <li
              key={level.title}
              className={`flex flex-col gap-2 rounded-card border bg-paper-raised p-6 ${
                level.isDefault ? 'border-accent' : 'border-line-muted'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-heading text-3xl font-semibold text-accent-strong">
                  {index + 1}
                </span>
                {level.isDefault && (
                  <span className="rounded-pill bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-strong">
                    Default
                  </span>
                )}
              </div>
              <h3 className="font-semibold text-ink">{level.title}</h3>
              <p className="text-sm leading-relaxed text-ink-muted">{level.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-ink-muted">
          Sending and booking stay off until you allow them for a specific account.
        </p>
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section aria-labelledby="privacy" className="border-t border-line-muted">
      <div className={`mx-auto ${WIDTH} px-6 py-20`}>
        <SectionHeading
          id="privacy"
          title="Private by default"
          lead="Your email and calendar are some of the most sensitive data you have. Mimus is built around that."
        />
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PRIVACY.map((item) => (
            <li key={item.title} className="flex flex-col gap-2">
              <item.icon className="size-5 text-accent-strong" aria-hidden />
              <h3 className="font-semibold text-ink">{item.title}</h3>
              <p className="text-sm leading-relaxed text-ink-muted">{item.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-ink-muted">
          The details are in our{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

function FinalCallToAction() {
  return (
    <section className="border-t border-line-muted">
      <div className={`mx-auto ${WIDTH} px-6 py-20`}>
        <div className="flex flex-col items-start gap-6 rounded-card bg-accent-soft px-8 py-12 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">
              Give your inbox a chief of staff.
            </h2>
            <p className="text-ink-muted">Connect an account and ask your first question.</p>
          </div>
          <Link href="/sign-in" className={primaryButton}>
            Get started
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
