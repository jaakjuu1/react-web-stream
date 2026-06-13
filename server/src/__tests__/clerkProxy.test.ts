import { describe, it, expect } from 'vitest';
import { applyClerkProxyHeaders } from '../app.js';

/** Minimal stand-in for the proxied ClientRequest, recording header ops. */
function fakeProxyReq() {
  const headers: Record<string, string> = {};
  const removed: string[] = [];
  return {
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    removeHeader(name: string) {
      removed.push(name);
      delete headers[name];
    },
    headers,
    removed,
  };
}

describe('applyClerkProxyHeaders', () => {
  it('identifies and authenticates the proxy to Clerk FAPI', () => {
    const req = fakeProxyReq();
    applyClerkProxyHeaders(req, {
      proxyUrl: 'https://cam.arvobitti.fi/__clerk',
      secretKey: 'sk_test_dummy',
    });

    expect(req.headers['Clerk-Proxy-Url']).toBe('https://cam.arvobitti.fi/__clerk');
    expect(req.headers['Clerk-Secret-Key']).toBe('sk_test_dummy');
  });

  it('strips Authorization so it never collides with the browser Origin header', () => {
    const req = fakeProxyReq();
    req.setHeader('Authorization', 'Bearer client-jwt-from-clerkjs');

    applyClerkProxyHeaders(req, { proxyUrl: 'https://cam.arvobitti.fi/__clerk' });

    expect(req.removed).toContain('Authorization');
    expect(req.headers['Authorization']).toBeUndefined();
  });

  it('omits the secret-key header when no secret is configured', () => {
    const req = fakeProxyReq();
    applyClerkProxyHeaders(req, { proxyUrl: 'https://cam.arvobitti.fi/__clerk' });

    expect(req.headers['Clerk-Proxy-Url']).toBe('https://cam.arvobitti.fi/__clerk');
    expect(req.headers['Clerk-Secret-Key']).toBeUndefined();
    // Authorization is always cleared, even when absent to begin with
    expect(req.removed).toContain('Authorization');
  });
});
