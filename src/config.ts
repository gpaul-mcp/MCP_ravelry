import * as z from 'zod';

const commaList = z.string().transform(value =>
  value
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean),
);

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
});

export type Config = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/**
 * Reads configuration from environment variables.
 *
 * `AUTH_USER` / `AUTH_PASS` are still accepted so configurations written for
 * v1 of this server keep working.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse({
    ravelryUsername: env.RAVELRY_USERNAME ?? env.AUTH_USER,
    ravelryPassword: env.RAVELRY_PASSWORD ?? env.AUTH_PASS,
    transport: env.MCP_TRANSPORT ?? 'stdio',
    host: env.HOST ?? '127.0.0.1',
    port: env.PORT ?? 3000,
    requestTimeoutMs: env.RAVELRY_TIMEOUT_MS ?? 15_000,
    allowedHosts: env.MCP_ALLOWED_HOSTS ?? '',
    urlSecret: env.MCP_URL_SECRET === '' ? undefined : env.MCP_URL_SECRET,
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE ?? 60,
    trustProxy: env.TRUST_PROXY ?? 'false',
  });

  if (!result.success) {
    const problems = result.error.issues.map(issue => {
      const key = String(issue.path[0]);
      if (key === 'ravelryUsername') return 'RAVELRY_USERNAME is not set';
      if (key === 'ravelryPassword') return 'RAVELRY_PASSWORD is not set';
      return `${key}: ${issue.message}`;
    });
    throw new ConfigError(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
  }

  return result.data;
}
