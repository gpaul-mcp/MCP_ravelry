import type {
  ApiPattern,
  ApiPatternCategoryNode,
  ApiPatternSearchResponse,
  ApiPatternsResponse,
  ApiShopSearchResponse,
  ApiYarn,
  ApiYarnSearchResponse,
  ApiYarnsResponse,
} from './types.ts';

const DEFAULT_BASE_URL = 'https://api.ravelry.com';

export interface RavelryClientOptions {
  username: string;
  password: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  baseUrl?: string;
  userAgent?: string;
  /** Injected for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Query parameters for Ravelry's search endpoints, using Ravelry's own names
 * (e.g. `pc`, `weight`, `ya`). Undefined values are dropped; arrays are
 * sent pipe-delimited, which Ravelry treats as OR.
 */
export type SearchParams = Record<
  string,
  string | number | readonly (string | number)[] | undefined
>;

const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

/** An error whose message is safe and useful to show to the model. */
export class RavelryApiError extends Error {
  override name = 'RavelryApiError';
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export class RavelryClient {
  readonly #authorization: string;
  readonly #timeoutMs: number;
  readonly #baseUrl: string;
  readonly #userAgent: string;
  readonly #fetch: typeof fetch;
  #categories: { value: ApiPatternCategoryNode; expires: number } | undefined;

  constructor(options: RavelryClientOptions) {
    this.#authorization = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}`;
    this.#timeoutMs = options.timeoutMs ?? 15_000;
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.#userAgent = options.userAgent ?? 'ravelry-mcp';
    this.#fetch = options.fetch ?? fetch;
  }

  searchPatterns(params: SearchParams, signal?: AbortSignal) {
    return this.#get<ApiPatternSearchResponse>('/patterns/search.json', params, signal);
  }

  /** Fetches full details for one or more patterns in a single request. */
  async getPatterns(ids: readonly number[], signal?: AbortSignal): Promise<ApiPattern[]> {
    const response = await this.#get<ApiPatternsResponse>('/patterns.json', { ids }, signal);
    return Object.values(response.patterns);
  }

  searchYarns(params: SearchParams, signal?: AbortSignal) {
    return this.#get<ApiYarnSearchResponse>('/yarns/search.json', params, signal);
  }

  /** Fetches full details for one or more yarns in a single request. */
  async getYarns(ids: readonly number[], signal?: AbortSignal): Promise<ApiYarn[]> {
    const response = await this.#get<ApiYarnsResponse>('/yarns.json', { ids }, signal);
    return Object.values(response.yarns);
  }

  searchShops(params: SearchParams, signal?: AbortSignal) {
    return this.#get<ApiShopSearchResponse>('/shops/search.json', params, signal);
  }

  /** The pattern category tree. Rarely changes, so it is cached for a day. */
  async getPatternCategories(signal?: AbortSignal): Promise<ApiPatternCategoryNode> {
    if (this.#categories && this.#categories.expires > Date.now()) return this.#categories.value;
    const response = await this.#get<{ pattern_categories: ApiPatternCategoryNode }>(
      '/pattern_categories/list.json',
      {},
      signal,
    );
    this.#categories = { value: response.pattern_categories, expires: Date.now() + CATALOG_TTL_MS };
    return response.pattern_categories;
  }

  async #get<T>(path: string, params: SearchParams, signal?: AbortSignal): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === '') continue;
      if (typeof value === 'object') {
        // Ravelry separates ids with spaces and filter values with pipes.
        if (value.length > 0) search.set(key, value.join(key === 'ids' ? ' ' : '|'));
      } else {
        search.set(key, String(value));
      }
    }
    const query = search.size > 0 ? `?${search.toString()}` : '';

    const timeout = AbortSignal.timeout(this.#timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}${query}`, {
        headers: {
          Accept: 'application/json',
          Authorization: this.#authorization,
          'User-Agent': this.#userAgent,
        },
        signal: combined,
      });
    } catch (error) {
      if (timeout.aborted) {
        throw new RavelryApiError(
          `Ravelry did not respond within ${this.#timeoutMs / 1000}s. Try again shortly.`,
        );
      }
      if (signal?.aborted) throw error;
      throw new RavelryApiError(
        `Could not reach Ravelry: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      throw new RavelryApiError(describeHttpError(response.status), response.status);
    }

    return (await response.json()) as T;
  }
}

function describeHttpError(status: number): string {
  switch (status) {
    case 401:
    case 403:
      return (
        'Ravelry rejected the API credentials. The server needs a read-only API key pair ' +
        'from https://www.ravelry.com/pro/developer in RAVELRY_USERNAME / RAVELRY_PASSWORD.'
      );
    case 404:
      return 'Ravelry returned 404 Not Found: no pattern matches that request.';
    case 429:
      return 'Ravelry is rate limiting requests. Wait a little before trying again.';
    default:
      return status >= 500
        ? `Ravelry is having trouble (HTTP ${status}). Try again later.`
        : `Ravelry request failed with HTTP ${status}.`;
  }
}
