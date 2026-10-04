import type { RavelryClient } from '../ravelry/client.ts';
import type { CounterStore } from './counters.ts';
import type { PreferenceStore } from './preferences.ts';

/** Everything the personal tools need for one signed-in user. */
export interface UserContext {
  username: string;
  /** Calls Ravelry with the user's own sign-in. */
  ravelry: RavelryClient;
  /** Calls Ravelry with the app's shared read-only key (public data). */
  publicRavelry: RavelryClient;
  /** Row counters kept on this server (absent where there is no database). */
  counters?: CounterStore;
  /** Per-user preferences such as units (absent where there is no database). */
  preferences?: PreferenceStore;
}
