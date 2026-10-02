import type { RavelryClient } from '../ravelry/client.ts';

/** Everything the personal tools need for one signed-in user. */
export interface UserContext {
  username: string;
  /** Calls Ravelry with the user's own sign-in. */
  ravelry: RavelryClient;
  /** Calls Ravelry with the app's shared read-only key (public data). */
  publicRavelry: RavelryClient;
}
