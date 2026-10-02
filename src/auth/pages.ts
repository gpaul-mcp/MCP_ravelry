// Minimal server-rendered pages for the sign-in flow.

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light dark; --fg: #222; --bg: #fff; --muted: #666; --card: #f5f3f0; --accent: #b4401c; }
@media (prefers-color-scheme: dark) { :root { --fg: #eee; --bg: #161616; --muted: #aaa; --card: #232323; --accent: #ee7a52; } }
body { font: 16px/1.5 system-ui, sans-serif; max-width: 30rem; margin: 3rem auto; padding: 0 1rem; color: var(--fg); background: var(--bg); }
.card { background: var(--card); border-radius: 12px; padding: 1.25rem 1.5rem; }
ul { padding-left: 1.2rem; } .muted { color: var(--muted); font-size: .9rem; }
.actions { display: flex; gap: .75rem; margin-top: 1.25rem; flex-wrap: wrap; }
button { font: inherit; padding: .6rem 1.2rem; border-radius: 8px; border: 1px solid var(--accent); cursor: pointer; }
.allow { background: var(--accent); color: #fff; } .deny { background: transparent; color: var(--fg); }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

export function consentPage(options: {
  uid: string;
  clientName: string;
  redirectHost: string;
  username: string;
  canWrite: boolean;
}): string {
  const action = `/oauth/interaction/${encodeURIComponent(options.uid)}`;
  return layout(
    'Allow access to your Ravelry account',
    `<div class="card">
<h1>Allow access?</h1>
<p><strong>${escapeHtml(options.clientName)}</strong> wants to use the Ravelry MCP server with your Ravelry account <strong>${escapeHtml(options.username)}</strong>.</p>
<p>It will be able to <strong>read</strong>:</p>
<ul><li>your stash</li><li>your queue</li><li>your projects</li><li>your favorites</li><li>your library</li></ul>
${
  options.canWrite
    ? `<p>and to <strong>add</strong> (when you ask it to):</p>
<ul><li>yarn to your stash</li><li>patterns to your queue</li></ul>
<p class="muted">It cannot edit or delete anything on Ravelry.`
    : '<p class="muted">It cannot change anything on Ravelry.'
} After you allow access, you'll be sent to <strong>${escapeHtml(options.redirectHost)}</strong>. Only continue if you started this from an app you trust.</p>
<div class="actions">
<form method="post" action="${action}/confirm"><button class="allow" type="submit">Allow</button></form>
<form method="post" action="${action}/abort"><button class="deny" type="submit">Deny</button></form>
</div>
</div>`,
  );
}

export function errorPage(message: string): string {
  return layout(
    'Sign-in problem',
    `<div class="card"><h1>Something went wrong</h1><p>${escapeHtml(message)}</p>
<p class="muted">Close this window and try connecting again from your app.</p></div>`,
  );
}
