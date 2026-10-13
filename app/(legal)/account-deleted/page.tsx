import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Account deleted · Mimus' };

export default function AccountDeletedPage() {
  return (
    <div className="flex flex-col gap-4 text-ink-muted">
      <h1 className="text-3xl font-semibold text-ink">Your account has been deleted</h1>
      <p>
        Your connected services were disconnected and the data imported from them was deleted.
        Thanks for trying Mimus.
      </p>
      <p>
        <Link href="/" className="underline underline-offset-2 hover:text-ink">
          Back to the homepage
        </Link>
      </p>
    </div>
  );
}
