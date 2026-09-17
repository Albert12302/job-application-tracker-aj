import { describe, expect, it } from 'vitest';
import { drainBody } from './body.ts';

describe('drainBody', () => {
  it('reads a body to the end, so an answer sent afterwards can complete', async () => {
    const req = new Request('http://function.test', { method: 'PUT', body: 'x'.repeat(1024) });
    await drainBody(req);
    expect(req.bodyUsed).toBe(true);
  });

  it('costs nothing when there is no body', async () => {
    const req = new Request('http://function.test', { method: 'GET' });
    await expect(drainBody(req)).resolves.toBeUndefined();
  });

  it('leaves a body someone else has already read alone', async () => {
    const req = new Request('http://function.test', { method: 'POST', body: '{"a":1}' });
    expect(await req.json()).toEqual({ a: 1 });
    await expect(drainBody(req)).resolves.toBeUndefined();
  });
});
