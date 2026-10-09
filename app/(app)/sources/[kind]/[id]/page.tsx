import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

// Where a tapped Mimus source lands. Read under the viewer's own session,
// so a source id for something they can't see is simply not found.

type Params = Promise<{ kind: string; id: string }>;

export default function SourcePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
      <SourceContent paramsPromise={params} />
    </Suspense>
  );
}

function formatDate(value: string | null): string {
  return value
    ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : '';
}

async function SourceContent({ paramsPromise }: { paramsPromise: Params }) {
  await connection();
  const { kind, id } = await paramsPromise;
  const context = await getCurrentWorkspaceContext();
  if (!context) redirect(`/sign-in?next=/sources/${kind}/${id}`);
  const { supabase } = context;

  if (kind === 'message') {
    const { data: message } = await supabase
      .from('messages')
      .select(
        'subject, body_text, snippet, sent_at, connected_accounts!inner(provider), from_person:people!messages_from_person_id_fkey(email, display_name)',
      )
      .eq('id', id)
      .maybeSingle<{
        subject: string | null;
        body_text: string | null;
        snippet: string | null;
        sent_at: string | null;
        connected_accounts: { provider: string };
        from_person: { email: string | null; display_name: string | null } | null;
      }>();
    if (!message) notFound();
    const from = message.from_person;
    return (
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Badge>{message.connected_accounts.provider}</Badge>
          <span className="text-sm text-ink-muted">{formatDate(message.sent_at)}</span>
        </div>
        <h1 className="mb-1 text-2xl font-semibold text-ink">
          {message.subject ?? '(no subject)'}
        </h1>
        {from && (
          <p className="mb-4 text-sm text-ink-muted">
            From {from.display_name ? `${from.display_name} <${from.email}>` : from.email}
          </p>
        )}
        <p className="text-sm whitespace-pre-wrap text-ink">
          {message.body_text ?? message.snippet ?? ''}
        </p>
      </Card>
    );
  }

  if (kind === 'event') {
    const { data: event } = await supabase
      .from('events')
      .select(
        'title, description, location, starts_at, ends_at, connected_accounts!inner(provider)',
      )
      .eq('id', id)
      .maybeSingle<{
        title: string | null;
        description: string | null;
        location: string | null;
        starts_at: string;
        ends_at: string;
        connected_accounts: { provider: string };
      }>();
    if (!event) notFound();
    return (
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Badge>{event.connected_accounts.provider}</Badge>
        </div>
        <h1 className="mb-1 text-2xl font-semibold text-ink">
          {event.title ?? '(untitled event)'}
        </h1>
        <p className="mb-4 text-sm text-ink-muted">
          {formatDate(event.starts_at)} – {formatDate(event.ends_at)}
          {event.location ? ` · ${event.location}` : ''}
        </p>
        {event.description && (
          <p className="text-sm whitespace-pre-wrap text-ink">{event.description}</p>
        )}
      </Card>
    );
  }

  notFound();
}
