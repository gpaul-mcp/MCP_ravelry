#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { setupAccounts } from './account/setup.ts';
import { ConfigError, loadConfig } from './config.ts';
import { serveHttp } from './http.ts';
import { RavelryClient } from './ravelry/client.ts';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.ts';

// stdout carries the MCP protocol over stdio: every log line goes to stderr.
const log = (message: string) => {
  console.error(`[${SERVER_NAME}] ${message}`);
};

async function main(): Promise<void> {
  const config = loadConfig();

  const ravelry = new RavelryClient({
    username: config.ravelryUsername,
    password: config.ravelryPassword,
    timeoutMs: config.requestTimeoutMs,
    userAgent: `${SERVER_NAME}-mcp/${SERVER_VERSION}`,
  });
  const factory = () => createServer(ravelry);

  let close: () => Promise<void>;
  if (config.transport === 'http') {
    const accounts =
      config.account &&
      setupAccounts({
        config: config.account,
        publicRavelry: ravelry,
        trustProxy: config.trustProxy,
        requestTimeoutMs: config.requestTimeoutMs,
        userAgent: `${SERVER_NAME}-mcp/${SERVER_VERSION}`,
      });
    const http = await serveHttp(factory, {
      host: config.host,
      port: config.port,
      allowedHosts: config.allowedHosts,
      urlSecret: config.urlSecret,
      rateLimitPerMinute: config.rateLimitPerMinute,
      trustProxy: config.trustProxy,
      account: accounts,
    });
    close = async () => {
      await http.close();
      accounts?.close();
    };
    if (accounts) log(`"Sign in with Ravelry" enabled at ${accounts.resourceUrl}`);
    const path = config.urlSecret ? '/mcp/<MCP_URL_SECRET>' : '/mcp';
    log(`v${SERVER_VERSION} listening on http://${config.host}:${config.port}${path}`);
    if (config.allowedHosts.length > 0) {
      log(`accepting public hostnames: ${config.allowedHosts.join(', ')}`);
    }
  } else {
    const handle = serveStdio(factory);
    close = () => handle.close();
    log(`v${SERVER_VERSION} running on stdio`);
  }

  const shutdown = () => {
    close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  log(error instanceof ConfigError ? error.message : `Fatal error: ${String(error)}`);
  process.exit(1);
});
