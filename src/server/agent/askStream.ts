import type { AskEvent, AskResult } from '@/src/server/agent/ask';

// What POST /api/agent/ask streams: one JSON event per line (NDJSON).
// `done` carries the authoritative result; `error` ends a failed run with a
// generic message (the real error goes to onError, never to the client).
export type AskStreamEvent =
  AskEvent | { type: 'done'; result: AskResult } | { type: 'error'; error: string };

export function askEventStream(
  run: (onEvent: (event: AskEvent) => void) => Promise<AskResult>,
  onError: (err: unknown) => void = () => undefined,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const write = (event: AskStreamEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        write({ type: 'done', result: await run(write) });
      } catch (err) {
        onError(err);
        write({ type: 'error', error: 'Mimus could not answer right now' });
      }
      controller.close();
    },
  });
}
