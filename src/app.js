import express from "express";
import cors from "cors";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { rateLimit } from "express-rate-limit";
import { security } from "./middleware.js";
import { publicRoutes } from "./routes/public.js";
import { tutorRoutes } from "./routes/tutor.js";
import { applicationRoutes } from "./routes/applications.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { adminRoutes } from "./routes/admin.js";
import { profileRoutes } from "./routes/profile.js";
import { paymentService } from "./payments.js";

export function createApp({
  clientUrl = "http://localhost:3000",
  config,
  db,
  auth,
  stripe,
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: clientUrl, credentials: true }));
  app.set("trust proxy", 1);
  if (config && db && auth) {
    const guards = security({ config, db, auth });
    const services = { config, db, auth, guards };
    const payments = paymentService({ ...services, stripe });
    app.post(
      "/api/payments/webhook",
      express.raw({ type: "application/json", limit: "1mb" }),
      payments.webhook,
    );
    app.all("/api/auth/*splat", toNodeHandler(auth));
    app.use(
      "/api",
      rateLimit({
        windowMs: 60000,
        limit: 180,
        standardHeaders: "draft-8",
        legacyHeaders: false,
      }),
    );
    app.get("/api/token", guards.issueToken);
    app.use(express.json({ limit: "100kb" }));
    app.use("/api", publicRoutes(services));
    app.use("/api/tutor", tutorRoutes(services));
    app.use("/api/applications", applicationRoutes(services));
    app.use("/api/dashboard", dashboardRoutes(services));
    app.use("/api/admin", adminRoutes(services));
    app.use("/api/account", profileRoutes(services));
    app.use("/api/payments", payments.router);
  }
  app.use(express.json({ limit: "100kb" }));

  // This is process liveness, not database or third-party service readiness.
  app.get("/", (_req, res) => {
    res.json({
      status: "ok",
      service: "mentorlagbe-api",
      message: "Welcome to the MentorLagbe API.",
      website: clientUrl,
      health: "/api/health",
    });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "mentorlagbe-api" });
  });

  app.use((_req, res) => {
    res
      .status(404)
      .json({
        error: { code: "NOT_FOUND", message: "This API route does not exist." },
      });
  });

  app.use((error, _req, res, _next) => {
    if (error.code === "LIMIT_FILE_SIZE")
      return res
        .status(413)
        .json({ error: { message: "Images must be smaller than 4 MB." } });
    if (error.type === "entity.parse.failed") {
      return res
        .status(400)
        .json({
          error: {
            code: "INVALID_JSON",
            message: "Request body must contain valid JSON.",
          },
        });
    }
    if (error.type === "entity.too.large") {
      return res
        .status(413)
        .json({
          error: {
            code: "BODY_TOO_LARGE",
            message: "Request body exceeds the allowed size.",
          },
        });
    }
    if (error.status >= 400 && error.status <= 503)
      return res
        .status(error.status)
        .json({ error: { message: error.message } });
    console.error("Unhandled request error:", error);
    res
      .status(500)
      .json({
        error: {
          code: "INTERNAL_ERROR",
          message: "Something went wrong. Please try again.",
        },
      });
  });

  return app;
}
