import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import Markdown, { type Components } from 'react-markdown';

// The policies are versioned as Markdown in legal/ so they read as plain
// documents in review. A synchronous read is a predictable value under
// Cache Components, so the rendered page lands in the static shell.
export function readLegalDoc(fileName: string): string {
  return readFileSync(join(process.cwd(), 'legal', fileName), 'utf8');
}

const components: Components = {
  h1: ({ children }) => <h1 className="mb-4 text-3xl font-semibold text-ink">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-10 mb-3 text-xl font-semibold text-ink">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-6 mb-2 text-base font-semibold text-ink">{children}</h3>,
  p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1 pl-6">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="mb-6 rounded-md border border-line-muted bg-paper-raised px-4 py-3 text-sm [&>p]:mb-0">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-paper-raised px-1 py-0.5 font-mono text-xs">{children}</code>
  ),
  a: ({ children, href = '' }) =>
    href.startsWith('/') ? (
      <Link href={href} className="underline underline-offset-2 hover:text-ink">
        {children}
      </Link>
    ) : (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-ink"
      >
        {children}
      </a>
    ),
};

export function LegalMarkdown({ source }: { source: string }) {
  return (
    <article className="text-ink-muted">
      <Markdown components={components} skipHtml>
        {source}
      </Markdown>
    </article>
  );
}
