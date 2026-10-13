import type { Metadata } from 'next';
import { LegalMarkdown, readLegalDoc } from '../legal-markdown';

export const metadata: Metadata = { title: 'Terms of Service · Mimus' };

const source = readLegalDoc('terms-of-service.md');

export default function TermsPage() {
  return <LegalMarkdown source={source} />;
}
