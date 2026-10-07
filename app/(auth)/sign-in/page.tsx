import { Suspense } from 'react';
import { SignInForm } from './sign-in-form';

export default function SignInPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <SignInForm />
    </Suspense>
  );
}
