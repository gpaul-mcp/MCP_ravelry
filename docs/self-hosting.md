# Self-hosting on a homelab with Cloudflare Tunnel

This publishes the server at a public HTTPS URL (for example `https://ravelry.example.com/mcp/<secret>`) that anyone you share it with can add to Claude or ChatGPT. Everything here is free: the server runs on your machine, and Cloudflare Tunnel exposes it without opening ports on your router.

Users share **your** read-only Ravelry API key, so before sharing the URL widely, check with api@ravelry.com that a hosted app is fine.

## What you need

- A machine that stays on, with Docker.
- A Cloudflare account (free) with a domain on it. If you have no domain, a [quick tunnel](#test-without-a-domain) works for testing, but its URL changes on every restart.
- Your Ravelry read-only API username and password.

## 1. Create the tunnel

1. In the Cloudflare dashboard, open **Zero Trust → Networks → Tunnels → Create a tunnel**, pick **Cloudflared**, and name it (e.g. `ravelry-mcp`).
2. Copy the **tunnel token** shown in the install command (the long string after `--token`). You don't need to run the command.
3. Add a **public hostname**: e.g. subdomain `ravelry`, your domain, service type **HTTP**, URL `ravelry-mcp:3000`.
   - If cloudflared already runs on this machine outside Docker, use `localhost:3000` instead.

## 2. Configure

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Fill in `.env`:

```dotenv
RAVELRY_USERNAME=your-api-username
RAVELRY_PASSWORD=your-api-password
MCP_ALLOWED_HOSTS=ravelry.example.com
MCP_URL_SECRET=<the random string from the command above, or leave out for a public instance>
RATE_LIMIT_PER_MINUTE=60
CLOUDFLARE_TUNNEL_TOKEN=<the tunnel token>
```

`MCP_URL_SECRET` is optional. With it, the endpoint is unlisted: only people you give the full URL to can use it. Leave it out to run a public instance at `/mcp` that you can advertise. The rate limit is per user (by their IP, from Cloudflare's `CF-Connecting-IP` header) and protects your Ravelry quota.

## 3. Start

```bash
docker compose --profile tunnel up -d --build
docker compose logs -f ravelry-mcp
```

Without `--profile tunnel`, only the MCP server starts (on `127.0.0.1:3000`), for when you already run cloudflared yourself.

Check it from anywhere:

```bash
curl https://ravelry.example.com/health
```

## 4. Connect Claude or ChatGPT

The server URL is `https://ravelry.example.com/mcp` (or `/mcp/<MCP_URL_SECRET>` if you set a secret); it needs no login. Opening `https://ravelry.example.com/` in a browser shows a page with the URL to use.

- **Claude:** Settings → Connectors → Add custom connector, paste the URL.
- **ChatGPT:** add it as a custom MCP connector/app (in developer mode), with no authentication.

Then ask something like "Find me a free crochet amigurumi pattern". The prompts ("Find a pattern", "Substitute a yarn", "What can I make with this yarn?", "Yarn shops near me") show up in each app's prompt or attachment menu.

## Update

```bash
git pull
docker compose --profile tunnel up -d --build
```

## Troubleshooting

| Symptom                                             | Fix                                                                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `403` with "Invalid Host header"                    | The hostname you use is missing from `MCP_ALLOWED_HOSTS`. If the tunnel rewrites the Host header, also add the service name (`ravelry-mcp`). |
| `404 Not found.`                                    | The URL is missing the secret, or the secret is wrong.                                                                                       |
| `429 Too many requests`                             | One user exceeded `RATE_LIMIT_PER_MINUTE`. If everyone gets it at once, `TRUST_PROXY` is not `true`, so all users share one limit.           |
| Tool calls fail with "rejected the API credentials" | Check `RAVELRY_USERNAME` / `RAVELRY_PASSWORD`.                                                                                               |
| Container restarts / unhealthy                      | `docker compose logs ravelry-mcp` shows the configuration error.                                                                             |

## Test without a domain

A quick tunnel gives a temporary `https://<random>.trycloudflare.com` URL:

```bash
docker compose up -d --build
docker run --rm --network host cloudflare/cloudflared:latest tunnel --url http://localhost:3000
```

Add the printed hostname to `MCP_ALLOWED_HOSTS` and restart the server (`docker compose up -d`). The URL changes each time the quick tunnel restarts, so use a named tunnel for anything you share.
