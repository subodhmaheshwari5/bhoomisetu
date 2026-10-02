import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env, isProduction } from "./config/env.js";
import { apiRouter } from "./routes/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export const app = express();

// Behind Docker/Nginx in production, the client IP comes via X-Forwarded-For;
// without this, express-rate-limit and req.ip would key off the proxy's IP
// instead of the real client, making the rate limits below meaningless.
if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(helmet());

// CORS origin policy.
//
// Production: a single exact origin from CORS_ORIGIN. Strict on purpose --
// a misconfigured production origin should fail loudly, not be widened.
//
// Development: any http://localhost / http://127.0.0.1 port. Vite silently
// shifts to 5174 (or 5175...) when 5173 is already taken, and a hardcoded
// origin then blocks every API call with a confusing network error. Allowing
// the loopback range keeps the dev experience working on whatever port Vite
// picked, without loosening anything outside localhost.
const corsOrigin = isProduction
  ? env.corsOrigin
  : (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return callback(null, true); // same-origin / curl / server-to-server
      const isLoopback = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      return callback(null, isLoopback);
    };

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan(isProduction ? "combined" : "dev"));

// Generous but present: protects the demo deployment without getting in the way of normal use.
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false });
app.use("/api", limiter);

// Login is a brute-force target, so it gets its own tighter limit on top of
// the general one above — keyed by IP, independent of whether the attempted
// email exists (the login handler itself never reveals that either).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "TOO_MANY_ATTEMPTS", message: "Too many login attempts. Try again later." } },
});
app.use("/api/auth/login", loginLimiter);

app.get("/api/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok", environment: env.nodeEnv } });
});

app.use("/api", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
