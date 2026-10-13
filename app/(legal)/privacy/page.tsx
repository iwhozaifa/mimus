import type { Metadata } from 'next';
import { LegalMarkdown, readLegalDoc } from '../legal-markdown';

export const metadata: Metadata = { title: 'Privacy Policy · Mimus' };

const source = readLegalDoc('privacy-policy.md');

export default function PrivacyPage() {
  return <LegalMarkdown source={source} />;
}
