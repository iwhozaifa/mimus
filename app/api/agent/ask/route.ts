import { askMimus } from '@/src/server/agent/ask';
import { AGENT_MODULES } from '@/src/server/agent/modules';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';

// API-first so future native clients call the same endpoint the web UI
// does. Thin by design: the logic and its tests live in
// src/server/agent/ask.ts.

export const maxDuration = 60;

const MAX_QUESTION_LENGTH = 2000;

export async function POST(request: Request) {
  // A JSON content type can't be sent cross-site without a CORS preflight,
  // which this route never grants -- so this doubles as CSRF protection
  // for the cookie-authenticated session.
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return Response.json({ error: 'Expected application/json' }, { status: 415 });
  }

  const context = await getCurrentWorkspaceContext();
  if (!context) return Response.json({ error: 'Not signed in' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    question?: unknown;
    module?: unknown;
  } | null;
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > MAX_QUESTION_LENGTH) {
    return Response.json(
      { error: `Ask a question of 1-${MAX_QUESTION_LENGTH} characters` },
      { status: 400 },
    );
  }
  const requestedModule =
    typeof body?.module === 'string' && AGENT_MODULES.some((m) => m.name === body.module)
      ? body.module
      : undefined;

  try {
    const result = await askMimus({
      ctx: {
        supabase: context.supabase,
        userId: context.userId,
        workspaceId: context.workspaceId,
      },
      question,
      module: requestedModule,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes('ANTHROPIC_API_KEY')) {
      return Response.json({ error: 'Mimus AI is not configured yet' }, { status: 503 });
    }
    console.error('[agent] ask failed', err);
    return Response.json({ error: 'Mimus could not answer right now' }, { status: 502 });
  }
}
