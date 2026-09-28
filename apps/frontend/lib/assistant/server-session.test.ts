import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@workos-inc/authkit-nextjs', () => ({ withAuth: vi.fn() }));
vi.mock('@/lib/convexServerClient', () => ({ getConvexServerSecret: () => 'test' }));

import { assertSameOrigin } from './server-session';

const publicOrigin = 'https://app.sxntixgxs.dev';
const internalOrigin = 'http://0.0.0.0:3000';
const request = (origin?: string, url = `${internalOrigin}/api/assistant/send`, extraHeaders = {}) =>
  new Request(url, { headers: { ...(origin === undefined ? {} : { origin }), ...extraHeaders } });

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_APP_URL', publicOrigin));
afterEach(() => vi.unstubAllEnvs());

describe('assistant origin protection behind the production proxy', () => {
  it.each(['send', 'transcribe'])('allows the public origin for the proxied %s endpoint', (endpoint) => {
    expect(() => assertSameOrigin(request(publicOrigin, `${internalOrigin}/api/assistant/${endpoint}`))).not.toThrow();
  });

  it('normalizes the configured public URL to its origin', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', ` ${publicOrigin}/ `);
    expect(() => assertSameOrigin(request(publicOrigin))).not.toThrow();
  });

  it.each([
    'https://untrusted.example',
    'https://app.sxntixgxs.dev.untrusted.example',
    'http://app.sxntixgxs.dev',
    'https://app.sxntixgxs.dev:8443',
    internalOrigin,
    'null',
  ])('rejects nonmatching origin %s despite forged proxy headers', (origin) => {
    expect(() =>
      assertSameOrigin(
        request(origin, undefined, {
          'host': new URL(origin === 'null' ? publicOrigin : origin).host,
          'x-forwarded-host': new URL(origin === 'null' ? publicOrigin : origin).host,
          'x-forwarded-proto': 'https',
        }),
      ),
    ).toThrow('Origen no autorizado.');
  });

  it('uses the direct request origin when the public URL is unconfigured', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(() =>
      assertSameOrigin(request('http://localhost:3000', 'http://localhost:3000/api/assistant/send')),
    ).not.toThrow();
    expect(() => assertSameOrigin(request(publicOrigin))).toThrow('Origen no autorizado.');
  });

  it.each(['not-a-url', 'file:///app', 'data:text/plain,app'])('fails closed for invalid app URL %s', (appUrl) => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', appUrl);
    expect(() => assertSameOrigin(request(internalOrigin))).toThrow();
    expect(() => assertSameOrigin(request('null'))).toThrow();
  });

  it('preserves requests without an Origin header for subsequent authentication', () => {
    expect(() => assertSameOrigin(request())).not.toThrow();
  });
});
