import { readFileSync } from 'node:fs';

import {
  getUiCapability,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';

/** The interactive view (MCP Apps) that renders tool results as cards in the chat. */
export const VIEW_URI = 'ui://ravelry/view.html';

/** Add to a tool's config to show its result in the view (both key spellings, for older hosts). */
export const VIEW_META = { ui: { resourceUri: VIEW_URI }, 'ui/resourceUri': VIEW_URI };

/** Whether the client renders MCP Apps views (it says so in its capabilities, per request). */
export function showsWidgets(server: McpServer): boolean {
  // Deprecated in favour of the per-request envelope, whose type the SDK does not expose yet;
  // the SDK fills this accessor from that envelope on every 2026-07-28 request.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const ui = getUiCapability(server.server.getClientCapabilities());
  return ui?.mimeTypes?.includes(RESOURCE_MIME_TYPE) ?? false;
}

/**
 * A tool result whose data the user already sees in the widget. Tells the
 * model not to repeat it, so the chat stays short; clients without widgets get
 * the plain result and the model presents it as text.
 */
export function widgetResult<T extends Record<string, unknown>>(
  server: McpServer,
  output: T,
  note: string,
) {
  const content: { type: 'text'; text: string }[] = [
    { type: 'text', text: JSON.stringify(output) },
  ];
  if (showsWidgets(server)) content.push({ type: 'text', text: note });
  return { content, structuredContent: output };
}

/** The note for pattern results shown in the carousel. */
export const CAROUSEL_NOTE =
  'The user sees these patterns in an interactive carousel (photos, difficulty, yarn, yardage, ' +
  'price, 👍/👎, Similar, Details and Queue buttons). Do not list or describe the patterns again. ' +
  'Reply with one short sentence at most, e.g. what the search covered or a question to narrow ' +
  'it down; say nothing if there is nothing to add. Their 👍/👎 picks reach you as context.';

const FALLBACK_HTML = `<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;color:#888">
The Ravelry view is not built. Run <code>npm run build</code>.</body>`;

let cached: string | undefined;

/** The bundled view: dist/ui/view.html, next to the compiled server (or built from src in dev). */
function viewHtml(): string {
  if (cached !== undefined) return cached;
  const fromSource = import.meta.url.endsWith('.ts');
  const file = new URL(fromSource ? '../dist/ui/view.html' : './ui/view.html', import.meta.url);
  try {
    cached = readFileSync(file, 'utf8');
  } catch {
    cached = FALLBACK_HTML;
  }
  return cached;
}

export function registerView(server: McpServer): void {
  registerAppResource(
    server,
    'Ravelry view',
    VIEW_URI,
    {
      description: 'Pattern, yarn, stash and shop cards for Ravelry results.',
      mimeType: RESOURCE_MIME_TYPE,
    },
    () => ({
      contents: [
        {
          uri: VIEW_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: viewHtml(),
          _meta: {
            ui: {
              // Pattern and yarn photos are served from Ravelry's image CDN.
              csp: { resourceDomains: ['https://*.ravelrycache.com'] },
              prefersBorder: false,
            },
          },
        },
      ],
    }),
  );
}
