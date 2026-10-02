import * as z from 'zod';

const commaList = z.string().transform(value =>
  value
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean),
);

const optional = (value: string | undefined) => (value === '' ? undefined : value);

const accountSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  publicUrl: z
    .url({ protocol: /^https?$/ })
    .transform(url => url.replace(/\/+$/, ''))
    .refine(url => new URL(url).pathname === '/', 'must be an origin, e.g. https://example.com'),
  authSecret: z.string().min(32, 'must be at least 32 characters'),
  dataDir: z.string().min(1),
});

const configSchema = z.object({
  ravelryUsername: z.string().min(1),
  ravelryPassword: z.string().min(1),
  transport: z.enum(['stdio', 'http']),
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65_535),
  requestTimeoutMs: z.coerce.number().int().positive(),
  allowedHosts: commaList,
  urlSecret: z
    .string()
    .regex(/^[A-Za-z0-9_-]{16,}$/, 'must be at least 16 letters, digits, "-" or "_"')
    .optional(),
  rateLimitPerMinute: z.coerce.number().int().min(0),
  trustProxy: z.enum(['true', 'false']).transform(value => value === 'true'),
  /** "Sign in with Ravelry" for personal tools; enabled when the OAuth app is configured. */
  account: accountSchema.optional(),
});

export type Config = z.infer<typeof configSchema>;
export type AccountConfig = z.infer<typeof accountSchema>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const ENV_NAMES: Record<string, string> = {
  ravelryUsername: 'RAVELRY_USERNAME',
  ravelryPassword: 'RAVELRY_PASSWORD',
  clientId: 'RAVELRY_OAUTH_CLIENT_ID',
  clientSecret: 'RAVELRY_OAUTH_CLIENT_SECRET',
  publicUrl: 'PUBLIC_URL',
  authSecret: 'AUTH_SECRET',
  dataDir: 'DATA_DIR',
};

/**
 * Reads configuration from environment variables.
 *
 * `AUTH_USER` / `AUTH_PASS` are still accepted so configurations written for
 * v1 of this server keep working.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const clientId = optional(env.RAVELRY_OAUTH_CLIENT_ID);
  const clientSecret = optional(env.RAVELRY_OAUTH_CLIENT_SECRET);

  const result = configSchema.safeParse({
    ravelryUsername: env.RAVELRY_USERNAME ?? env.AUTH_USER,
    ravelryPassword: env.RAVELRY_PASSWORD ?? env.AUTH_PASS,
    transport: env.MCP_TRANSPORT ?? 'stdio',
    host: env.HOST ?? '127.0.0.1',
    port: env.PORT ?? 3000,
    requestTimeoutMs: env.RAVELRY_TIMEOUT_MS ?? 15_000,
    allowedHosts: env.MCP_ALLOWED_HOSTS ?? '',
    urlSecret: optional(env.MCP_URL_SECRET),
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE ?? 60,
    trustProxy: env.TRUST_PROXY ?? 'false',
    account:
      clientId || clientSecret
        ? {
            clientId,
            clientSecret,
            publicUrl: optional(env.PUBLIC_URL),
            authSecret: optional(env.AUTH_SECRET),
            dataDir: optional(env.DATA_DIR) ?? './data',
          }
        : undefined,
  });

  if (!result.success) {
    const problems = result.error.issues.map(issue => {
      const key = String(issue.path.at(-1));
      const name = ENV_NAMES[key] ?? key;
      return issue.code === 'invalid_type' ? `${name} is not set` : `${name}: ${issue.message}`;
    });
    throw new ConfigError(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
  }

  const config = result.data;
  if (config.account && config.transport !== 'http') {
    throw new ConfigError(
      'Invalid configuration:\n  - "Sign in with Ravelry" needs MCP_TRANSPORT=http',
    );
  }
  return config;
}
