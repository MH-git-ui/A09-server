import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { connectDatabase } from "./db.js";
import { createAuth } from "./auth.js";

// Share initialization across simultaneous requests in a warm function instance.
export function createRuntimeLoader(initialize = async () => {
  const config = readConfig();
  const database = await connectDatabase(config);
  try {
    const auth = createAuth(config, database);
    return { database, app: createApp({ clientUrl: config.CLIENT_URL, config, db: database.db, auth }) };
  } catch (error) {
    await database.client.close();
    throw error;
  }
}) {
  let pending;
  return () => {
    pending ??= Promise.resolve().then(initialize).catch((error) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}
