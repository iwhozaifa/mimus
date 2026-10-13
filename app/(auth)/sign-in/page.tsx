import Link from 'next/link';
import { Suspense } from 'react';
import { MimusLogo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { SignInForm } from './sign-in-form';

export default function SignInPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-paper px-4 py-12">
      <ThemeToggle className="absolute top-4 right-4" />
      <Link href="/" aria-label="Mimus home" className="text-ink">
        <MimusLogo className="h-[34px] w-auto" />
      </Link>
      <div className="w-full max-w-sm rounded-card border border-line-muted bg-paper-raised p-6 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-ink">Sign in</h1>
        <p className="mb-6 text-sm text-ink-muted">
          We&apos;ll email you a magic link — no password needed.
        </p>
        <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
          <SignInForm />
        </Suspense>
        <p className="mt-6 text-xs text-ink-muted">
          By continuing, you agree to the{' '}
          <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
            Terms of Service
          </Link>{' '}
          and acknowledge the{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
