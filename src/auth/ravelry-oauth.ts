import { RavelryApiError } from '../ravelry/client.ts';

const AUTHORIZE_URL = 'https://www.ravelry.com/oauth2/auth';
const TOKEN_URL = 'https://www.ravelry.com/oauth2/token';
const API_URL = 'https://api.ravelry.com';

export interface RavelryTokens {
  accessToken: string;
  refreshToken: string | undefined;
  /** Epoch milliseconds. */
  expiresAt: number;
}

export interface RavelryOAuthOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch?: typeof fetch;
}

/** Ravelry's OAuth 2.0 endpoints, used as the "login" step of our own server. */
export class RavelryOAuth {
  readonly #options: RavelryOAuthOptions;
  readonly #fetch: typeof fetch;

  constructor(options: RavelryOAuthOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? fetch;
  }

  authorizeUrl(state: string): string {
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.#options.clientId,
      redirect_uri: this.#options.redirectUri,
      // "offline" makes Ravelry issue a refresh token; its access tokens last 24 h.
      scope: 'offline',
      state,
    }).toString();
    return url.toString();
  }

  exchangeCode(code: string): Promise<RavelryTokens> {
    return this.#token({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.#options.redirectUri,
    });
  }

  refresh(refreshToken: string): Promise<RavelryTokens> {
    return this.#token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  async currentUser(accessToken: string): Promise<{ id: number; username: string }> {
    const response = await this.#fetch(`${API_URL}/current_user.json`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new RavelryApiError(
        `Ravelry did not return the signed-in user (HTTP ${response.status}).`,
      );
    }
    const { user } = (await response.json()) as { user: { id: number; username: string } };
    return { id: user.id, username: user.username };
  }

  async #token(params: Record<string, string>): Promise<RavelryTokens> {
    const credentials = Buffer.from(
      `${this.#options.clientId}:${this.#options.clientSecret}`,
    ).toString('base64');
    const response = await this.#fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        // Ravelry only accepts client credentials in the Authorization header.
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new RavelryApiError(
        `Ravelry sign-in failed (HTTP ${response.status}).`,
        response.status,
      );
    }
    const body = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: Date.now() + (body.expires_in ?? 24 * 60 * 60) * 1000,
    };
  }
}
