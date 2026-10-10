import type { AskResult } from '@/src/server/agent/ask';
import { askEventStream } from '@/src/server/agent/askStream';
import { describe, expect, it, vi } from 'vitest';

async function lines(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const text = await new Response(stream).text();
  expect(text.endsWith('\n')).toBe(true);
  return text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

const result: AskResult = {
  status: 'ok',
  answer: 'Sign by **Friday**.',
  sources: [],
  module: 'lookup',
  tier: 'fast',
  logId: 'log-1',
};

describe('askEventStream', () => {
  it('writes each progress event as a JSON line, then the final result', async () => {
    const stream = askEventStream(async (onEvent) => {
      onEvent({ type: 'status', text: 'Searching email…' });
      onEvent({ type: 'delta', text: 'Sign by ' });
      return result;
    });

    expect(await lines(stream)).toEqual([
      { type: 'status', text: 'Searching email…' },
      { type: 'delta', text: 'Sign by ' },
      { type: 'done', result },
    ]);
  });

  it('ends with an error event, never the internal message, when the run fails', async () => {
    const onError = vi.fn();
    const failure = new Error('connection reset by api.openai.com');
    const stream = askEventStream(async (onEvent) => {
      onEvent({ type: 'status', text: 'Thinking…' });
      throw failure;
    }, onError);

    expect(await lines(stream)).toEqual([
      { type: 'status', text: 'Thinking…' },
      { type: 'error', error: 'Mimus could not answer right now' },
    ]);
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
