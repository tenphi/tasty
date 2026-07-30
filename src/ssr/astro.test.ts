import { afterEach, describe, expect, it } from 'vitest';

import { resetConfig } from '../config';

import { tastyMiddleware } from './astro';

const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function makeResponse(body: BodyInit | null, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType },
  });
}

describe('tastyMiddleware', () => {
  afterEach(() => {
    resetConfig();
  });

  it('passes binary (non-HTML) responses through untouched', async () => {
    const onRequest = tastyMiddleware();
    const next = async () => makeResponse(PNG_MAGIC, 'image/png');

    const result = await onRequest({}, next);
    const bytes = new Uint8Array(await result.arrayBuffer());

    expect(bytes).toEqual(PNG_MAGIC);
    expect(result.headers.get('content-type')).toBe('image/png');
  });

  it('does not corrupt JSON endpoint responses', async () => {
    const onRequest = tastyMiddleware();
    const payload = JSON.stringify({ emoji: '🚀', value: 42 });
    const next = async () => makeResponse(payload, 'application/json');

    const result = await onRequest({}, next);

    expect(await result.text()).toBe(payload);
  });

  it('reads and returns HTML responses', async () => {
    const onRequest = tastyMiddleware();
    const html = '<html><head></head><body>hi</body></html>';
    const next = async () => makeResponse(html, 'text/html; charset=utf-8');

    const result = await onRequest({}, next);

    expect(await result.text()).toBe(html);
  });

  it('passes bodyless responses through untouched', async () => {
    const onRequest = tastyMiddleware();
    const next = async () =>
      new Response(null, { status: 204, headers: { 'x-custom': '1' } });

    const result = await onRequest({}, next);

    expect(result.status).toBe(204);
    expect(result.headers.get('x-custom')).toBe('1');
  });
});
