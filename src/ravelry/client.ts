import type {
  ApiFavoritesResponse,
  ApiNeedleRecord,
  ApiLibraryResponse,
  ApiPattern,
  ApiPatternCategoryNode,
  ApiPatternSearchResponse,
  ApiPatternsResponse,
  ApiProjectsResponse,
  ApiQueueResponse,
  ApiShopSearchResponse,
  ApiPack,
  ApiProjectFull,
  ApiQueuedProject,
  ApiStash,
  ApiStashFull,
  ApiStashListResponse,
  ApiNeedleSizeRow,
  ApiYarn,
  ApiYarnSearchResponse,
  ApiYarnWeight,
  ApiYarnsResponse,
} from './types.ts';

const DEFAULT_BASE_URL = 'https://api.ravelry.com';

export interface RavelryClientOptions {
  /** App credentials (the read-only basic auth key). */
  username?: string;
  password?: string;
  /** Per-user credentials instead: returns the `Authorization` header to send. */
  authorization?: () => Promise<string>;
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
  readonly #authorization: () => Promise<string>;
  readonly #perUser: boolean;
  readonly #timeoutMs: number;
  readonly #baseUrl: string;
  readonly #userAgent: string;
  readonly #fetch: typeof fetch;
  readonly #catalogs = new Map<string, { value: Promise<unknown>; expires: number }>();

  constructor(options: RavelryClientOptions) {
    if (options.authorization) {
      this.#authorization = options.authorization;
      this.#perUser = true;
    } else {
      const credentials = `${options.username ?? ''}:${options.password ?? ''}`;
      const basic = `Basic ${Buffer.from(credentials).toString('base64')}`;
      this.#authorization = () => Promise.resolve(basic);
      this.#perUser = false;
    }
    this.#timeoutMs = options.timeoutMs ?? 15_000;
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.#userAgent = options.userAgent ?? 'ravelry-mcp';
    this.#fetch = options.fetch ?? fetch;
  }

  searchPatterns(params: SearchParams, signal?: AbortSignal) {
    return this.#request<ApiPatternSearchResponse>('/patterns/search.json', params, signal);
  }

  /** Fetches full details for one or more patterns in a single request. */
  async getPatterns(ids: readonly number[], signal?: AbortSignal): Promise<ApiPattern[]> {
    const response = await this.#request<ApiPatternsResponse>('/patterns.json', { ids }, signal);
    return Object.values(response.patterns);
  }

  searchYarns(params: SearchParams, signal?: AbortSignal) {
    return this.#request<ApiYarnSearchResponse>('/yarns/search.json', params, signal);
  }

  /** Fetches full details for one or more yarns in a single request. */
  async getYarns(ids: readonly number[], signal?: AbortSignal): Promise<ApiYarn[]> {
    const response = await this.#request<ApiYarnsResponse>('/yarns.json', { ids }, signal);
    return Object.values(response.yarns);
  }

  searchShops(params: SearchParams, signal?: AbortSignal) {
    return this.#request<ApiShopSearchResponse>('/shops/search.json', params, signal);
  }

  /** The pattern category tree. Rarely changes, so it is cached for a day. */
  getPatternCategories(signal?: AbortSignal): Promise<ApiPatternCategoryNode> {
    return this.#catalog(
      '/pattern_categories/list.json',
      signal,
      response => (response as { pattern_categories: ApiPatternCategoryNode }).pattern_categories,
    );
  }

  /** Every needle and hook size, metric with US names. Cached for a day. */
  getNeedleSizes(signal?: AbortSignal): Promise<ApiNeedleSizeRow[]> {
    return this.#catalog(
      '/needles/sizes.json',
      signal,
      response => (response as { needle_sizes: ApiNeedleSizeRow[] }).needle_sizes,
    );
  }

  /** Yarn weights with ply, wraps per inch and typical gauge. Cached for a day. */
  getYarnWeights(signal?: AbortSignal): Promise<ApiYarnWeight[]> {
    return this.#catalog(
      '/yarn_weights.json',
      signal,
      response => (response as { yarn_weights: ApiYarnWeight[] }).yarn_weights,
    );
  }

  /** Reference lists that rarely change, shared by every request for a day. */
  #catalog<T>(path: string, signal: AbortSignal | undefined, pick: (response: unknown) => T) {
    const cached = this.#catalogs.get(path);
    if (cached && cached.expires > Date.now()) return cached.value as Promise<T>;
    const value = this.#request<unknown>(path, {}, signal).then(pick);
    this.#catalogs.set(path, { value, expires: Date.now() + CATALOG_TTL_MS });
    // A failed request is not cached.
    value.catch(() => this.#catalogs.delete(path));
    return value;
  }

  // ---- Personal data: only works with a per-user `authorization`. ----

  listStash(username: string, params: SearchParams, signal?: AbortSignal) {
    return this.#request<ApiStashListResponse>(
      `/people/${user(username)}/stash/list.json`,
      params,
      signal,
    );
  }

  listQueue(username: string, params: SearchParams, signal?: AbortSignal) {
    return this.#request<ApiQueueResponse>(
      `/people/${user(username)}/queue/list.json`,
      params,
      signal,
    );
  }

  listProjects(username: string, params: SearchParams, signal?: AbortSignal) {
    return this.#request<ApiProjectsResponse>(
      `/projects/${user(username)}/list.json`,
      params,
      signal,
    );
  }

  listFavorites(username: string, params: SearchParams, signal?: AbortSignal) {
    return this.#request<ApiFavoritesResponse>(
      `/people/${user(username)}/favorites/list.json`,
      params,
      signal,
    );
  }

  /** The needles and hooks the user owns. */
  async listNeedles(username: string, signal?: AbortSignal): Promise<ApiNeedleRecord[]> {
    const response = await this.#request<{ needle_records: ApiNeedleRecord[] }>(
      `/people/${user(username)}/needles/list.json`,
      {},
      signal,
    );
    return response.needle_records;
  }

  searchLibrary(username: string, params: SearchParams, signal?: AbortSignal) {
    return this.#request<ApiLibraryResponse>(
      `/people/${user(username)}/library/search.json`,
      params,
      signal,
    );
  }

  /** Creates a stash entry; `data` is Ravelry's Stash (POST) object. */
  createStash(username: string, data: Record<string, unknown>, signal?: AbortSignal) {
    return this.#request<{ stash: ApiStash }>(
      `/people/${user(username)}/stash/create.json`,
      {},
      signal,
      data,
    );
  }

  /** Adds a pattern to the queue; `data` is Ravelry's QueuedProject (POST) object. */
  createQueuedProject(username: string, data: Record<string, unknown>, signal?: AbortSignal) {
    return this.#request<{ queued_project: ApiQueuedProject }>(
      `/people/${user(username)}/queue/create.json`,
      {},
      signal,
      data,
    );
  }

  getStash(username: string, id: number, signal?: AbortSignal) {
    return this.#request<{ stash: ApiStashFull }>(
      `/people/${user(username)}/stash/${id}.json`,
      {},
      signal,
    );
  }

  updateStash(username: string, id: number, data: Record<string, unknown>, signal?: AbortSignal) {
    return this.#request<{ stash: ApiStashFull }>(
      `/people/${user(username)}/stash/${id}.json`,
      {},
      signal,
      data,
    );
  }

  deleteStash(username: string, id: number, signal?: AbortSignal) {
    return this.#request<{ stash: ApiStash }>(
      `/people/${user(username)}/stash/${id}.json`,
      {},
      signal,
      undefined,
      'DELETE',
    );
  }

  getProject(username: string, id: number, signal?: AbortSignal) {
    return this.#request<{ project: ApiProjectFull }>(
      `/projects/${user(username)}/${id}.json`,
      {},
      signal,
    );
  }

  /** Creates a project; `data` is Ravelry's Project (POST) object, packs included. */
  createProject(username: string, data: Record<string, unknown>, signal?: AbortSignal) {
    return this.#request<{ project: ApiProjectFull }>(
      `/projects/${user(username)}/create.json`,
      {},
      signal,
      data,
    );
  }

  updateProject(username: string, id: number, data: Record<string, unknown>, signal?: AbortSignal) {
    return this.#request<{ project: ApiProjectFull }>(
      `/projects/${user(username)}/${id}.json`,
      {},
      signal,
      data,
    );
  }

  deleteProject(username: string, id: number, signal?: AbortSignal) {
    return this.#request<unknown>(
      `/projects/${user(username)}/${id}.json`,
      {},
      signal,
      undefined,
      'DELETE',
    );
  }

  /** Updates a pack. Ravelry documents PUT, but only POST works (PUT redirects in a loop). */
  updatePack(id: number, data: Record<string, unknown>, signal?: AbortSignal) {
    return this.#request<{ pack: ApiPack }>(`/packs/${id}.json`, {}, signal, data);
  }

  /** Links more stash yarn to an existing project (packs on create are passed with the project). */
  createPack(data: Record<string, unknown>, signal?: AbortSignal) {
    return this.#request<{ pack: ApiPack }>('/packs/create.json', {}, signal, data);
  }

  deletePack(id: number, signal?: AbortSignal) {
    return this.#request<{ pack: ApiPack }>(`/packs/${id}.json`, {}, signal, undefined, 'DELETE');
  }

  deleteQueuedProject(username: string, id: number, signal?: AbortSignal) {
    return this.#request<unknown>(
      `/people/${user(username)}/queue/${id}.json`,
      {},
      signal,
      undefined,
      'DELETE',
    );
  }

  /** GET by default, POST when `body` is given, or an explicit `method`. */
  async #request<T>(
    path: string,
    params: SearchParams,
    signal?: AbortSignal,
    body?: Record<string, unknown>,
    method: 'GET' | 'POST' | 'DELETE' = body ? 'POST' : 'GET',
  ): Promise<T> {
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

    const authorization = await this.#authorization();
    const timeout = AbortSignal.timeout(this.#timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}${query}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: authorization,
          'User-Agent': this.#userAgent,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
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
      throw new RavelryApiError(describeHttpError(response.status, this.#perUser), response.status);
    }

    return (await response.json()) as T;
  }
}

const user = (username: string) => encodeURIComponent(username);

function describeHttpError(status: number, perUser: boolean): string {
  if (perUser && (status === 401 || status === 403)) {
    return (
      'Ravelry refused access with your sign-in. Disconnect and reconnect the Ravelry ' +
      'connector to sign in again.'
    );
  }
  switch (status) {
    case 401:
    case 403:
      return (
        'Ravelry rejected the API credentials. The server needs a read-only API key pair ' +
        'from https://www.ravelry.com/pro/developer in RAVELRY_USERNAME / RAVELRY_PASSWORD.'
      );
    case 404:
      return 'Ravelry returned 404 Not Found: nothing exists with that id or name.';
    case 429:
      return 'Ravelry is rate limiting requests. Wait a little before trying again.';
    default:
      return status >= 500
        ? `Ravelry is having trouble (HTTP ${status}). Try again later.`
        : `Ravelry request failed with HTTP ${status}.`;
  }
}
