import express from "express";
import cors from "cors";
import helmet from "helmet";

export function createApp({ clientUrl = "http://localhost:3000" } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: clientUrl, credentials: true }));
  app.use(express.json({ limit: "100kb" }));

  // This is process liveness, not database or third-party service readiness.
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "mentorlagbe-api" });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "This API route does not exist." } });
  });

  app.use((error, _req, res, _next) => {
    if (error.type === "entity.parse.failed") {
      return res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body must contain valid JSON." } });
    }
    if (error.type === "entity.too.large") {
      return res.status(413).json({ error: { code: "BODY_TOO_LARGE", message: "Request body exceeds the allowed size." } });
    }
    console.error("Unhandled request error:", error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
  });

  return app;
}
