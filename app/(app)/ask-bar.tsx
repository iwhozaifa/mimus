'use client';

import { Loader2, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { searchPlaceholderFor } from './view-toggle';

interface Source {
  kind: 'message' | 'event';
  id: string;
  title: string;
  timestamp: string | null;
  provider: string;
}

type State =
  | { phase: 'idle' }
  | { phase: 'asking'; question: string }
  | { phase: 'answered'; question: string; answer: string; sources: Source[] }
  | { phase: 'failed'; question: string; error: string };

function formatTimestamp(timestamp: string | null): string {
  return timestamp
    ? new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';
}

export function AskBar() {
  const pathname = usePathname() ?? '';
  const [question, setQuestion] = useState('');
  const [state, setState] = useState<State>({ phase: 'idle' });

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const asked = question.trim();
    if (!asked || state.phase === 'asking') return;
    setState({ phase: 'asking', question: asked });
    try {
      const response = await fetch('/api/agent/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: asked }),
      });
      const body = await response.json();
      setState(
        response.ok
          ? { phase: 'answered', question: asked, answer: body.answer, sources: body.sources }
          : { phase: 'failed', question: asked, error: body.error ?? 'Something went wrong' },
      );
    } catch {
      setState({ phase: 'failed', question: asked, error: 'Network error' });
    }
  }

  return (
    <div className="relative hidden w-72 sm:block">
      <form onSubmit={ask} role="search">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
        <input
          aria-label="Ask Mimus"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={searchPlaceholderFor(pathname)}
          maxLength={2000}
          className="w-full rounded-pill border border-line-muted bg-paper py-1.5 pr-3 pl-9 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
        />
      </form>

      {state.phase !== 'idle' && (
        <div
          role="region"
          aria-label="Mimus answer"
          className="absolute right-0 z-20 mt-2 w-[28rem] max-w-[90vw] rounded-card border border-line-muted bg-paper-raised p-4 shadow-lg"
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="text-xs font-medium text-ink-muted">{state.question}</p>
            <button
              type="button"
              aria-label="Close answer"
              onClick={() => setState({ phase: 'idle' })}
              className="text-ink-faint hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>

          {state.phase === 'asking' && (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" /> Thinking…
            </p>
          )}
          {state.phase === 'failed' && <p className="text-sm text-danger">{state.error}</p>}
          {state.phase === 'answered' && (
            <>
              <p className="text-sm whitespace-pre-wrap text-ink">{state.answer}</p>
              {state.sources.length > 0 && (
                <div className="mt-4 border-t border-line-muted pt-3">
                  <p className="mb-2 text-xs font-medium tracking-wide text-ink-muted uppercase">
                    Sources
                  </p>
                  <ul className="flex flex-col gap-1">
                    {state.sources.map((source) => (
                      <li key={`${source.kind}:${source.id}`}>
                        <Link
                          href={`/sources/${source.kind}/${source.id}`}
                          onClick={() => setState({ phase: 'idle' })}
                          className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1 text-sm hover:bg-paper"
                        >
                          <span className="truncate text-ink">{source.title}</span>
                          <span className="shrink-0 text-xs text-ink-faint capitalize">
                            {source.provider} · {formatTimestamp(source.timestamp)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
