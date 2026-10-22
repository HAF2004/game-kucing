import { createDatabase } from './db';
import { createApiContext, type ApiContext } from './apiRouter';

let contextPromise: Promise<ApiContext> | undefined;

/** Reuses one connection per warm serverless instance and retries after setup failures. */
export function getApiContext(): Promise<ApiContext> {
  if (!contextPromise) {
    contextPromise = createDatabase({
      runMigrations: false,
      seedInitialRivals: false,
      requireRemote: true,
    })
      .then(createApiContext)
      .catch((error: unknown) => {
        contextPromise = undefined;
        throw error;
      });
  }
  return contextPromise;
}
