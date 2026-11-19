import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { connectDatabase } from "./db.js";
import { createAuth } from "./auth.js";

const port = Number(process.env.PORT ?? 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer between 1 and 65535.");
const clientUrl = process.env.CLIENT_URL ?? "http://localhost:3000";
const parsedClientUrl = new URL(clientUrl);
if (
  !["http:", "https:"].includes(parsedClientUrl.protocol) ||
  parsedClientUrl.origin !== clientUrl
) {
  throw new Error(
    "CLIENT_URL must be an HTTP(S) origin without a path or trailing slash.",
  );
}
if (process.env.NODE_ENV === "production" && !process.env.CLIENT_URL) {
  throw new Error("CLIENT_URL must be configured for production.");
}

const config = readConfig();
const database = await connectDatabase(config);
const auth = createAuth(config, database);
const server = createApp({ clientUrl, config, db: database.db, auth }).listen(
  port,
  () => {
    console.log(`MentorLagbe API listening at http://localhost:${port}`);
  },
);
server.on("error", (error) => {
  console.error("API could not start:", error.message);
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close(async () => {
      await database.client.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
