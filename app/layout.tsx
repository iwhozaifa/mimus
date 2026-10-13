import { THEME_SCRIPT } from '@/src/lib/theme';
import type { Metadata, Viewport } from 'next';
import { DM_Sans, Geist_Mono, Outfit } from 'next/font/google';
import './globals.css';

// Brand type: Outfit for headings, DM Sans for body text.
const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
});

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Mimus',
  description:
    'Mimus is an AI chief of staff for founder-led businesses. It reads the email, calendar and Slack you connect, answers your questions, and schedules meetings with your approval.',
  openGraph: {
    title: 'Mimus',
    description: 'An AI chief of staff for founder-led businesses.',
    siteName: 'Mimus',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0c' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // The theme script sets the "dark" class before React hydrates, so the
    // server-rendered className is expected to differ.
    <html
      lang="en"
      className={`${outfit.variable} ${dmSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
