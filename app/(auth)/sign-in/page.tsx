import { Suspense } from 'react';
import { SignInForm } from './sign-in-form';

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Sign in</h1>
        <p className="mb-6 text-sm text-slate-500">
          We&apos;ll email you a magic link — no password needed.
        </p>
        <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
          <SignInForm />
        </Suspense>
      </div>
    </main>
  );
}
