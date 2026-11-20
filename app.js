import express from "express";
import { createRuntimeLoader } from "./src/runtime.js";

// Vercel discovers this root entry point. Do not open a listening socket here.
const app = express();
app.disable("x-powered-by");
const loadRuntime = createRuntimeLoader();
app.use(async (req, res, next) => {
  try {
    const runtime = await loadRuntime();
    runtime.app(req, res, next);
  } catch {
    console.error("API initialization failed. Check deployment environment and database access.");
    res.status(503).set("Cache-Control", "no-store").json({
      error: { code: "SERVICE_UNAVAILABLE", message: "The service is temporarily unavailable. Please try again." },
    });
  }
});
export default app;
