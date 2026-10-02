import { readFileSync } from 'node:fs';

import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';

/** The interactive view (MCP Apps) that renders tool results as cards in the chat. */
export const VIEW_URI = 'ui://ravelry/view.html';

/** Add to a tool's config to show its result in the view (both key spellings, for older hosts). */
export const VIEW_META = { ui: { resourceUri: VIEW_URI }, 'ui/resourceUri': VIEW_URI };

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
