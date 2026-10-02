import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  it('reads RAVELRY_* variables and applies defaults', () => {
    expect(loadConfig({ RAVELRY_USERNAME: 'u', RAVELRY_PASSWORD: 'p' })).toEqual({
      ravelryUsername: 'u',
      ravelryPassword: 'p',
      transport: 'stdio',
      host: '127.0.0.1',
      port: 3000,
      requestTimeoutMs: 15_000,
      allowedHosts: [],
      urlSecret: undefined,
      rateLimitPerMinute: 60,
      trustProxy: false,
    });
  });

  it('still accepts the legacy AUTH_USER / AUTH_PASS names', () => {
    const config = loadConfig({ AUTH_USER: 'u', AUTH_PASS: 'p' });
    expect(config.ravelryUsername).toBe('u');
    expect(config.ravelryPassword).toBe('p');
  });

  it('names every missing credential in the error', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/RAVELRY_USERNAME is not set[\s\S]*RAVELRY_PASSWORD/);
  });

  it('parses hosting options', () => {
    const config = loadConfig({
      RAVELRY_USERNAME: 'u',
      RAVELRY_PASSWORD: 'p',
      MCP_ALLOWED_HOSTS: 'Ravelry.example.com, mcp.example.org',
      MCP_URL_SECRET: 'abcdefghijklmnop1234',
      RATE_LIMIT_PER_MINUTE: '10',
      TRUST_PROXY: 'true',
    });
    expect(config).toMatchObject({
      allowedHosts: ['ravelry.example.com', 'mcp.example.org'],
      urlSecret: 'abcdefghijklmnop1234',
      rateLimitPerMinute: 10,
      trustProxy: true,
    });
  });

  it('rejects a short URL secret', () => {
    expect(() =>
      loadConfig({ RAVELRY_USERNAME: 'u', RAVELRY_PASSWORD: 'p', MCP_URL_SECRET: 'short' }),
    ).toThrow(/urlSecret/);
  });

  it('rejects an unknown transport', () => {
    expect(() =>
      loadConfig({ RAVELRY_USERNAME: 'u', RAVELRY_PASSWORD: 'p', MCP_TRANSPORT: 'sse' }),
    ).toThrow(/transport/);
  });
});
