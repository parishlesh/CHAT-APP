import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth-route.js";
import messageRoute from "./routes/message-route.js";
import { app, server } from "./lib/socket.js";
import { isOriginAllowed } from "./lib/origins.js";
import { apiLimiter } from "./middleware/rate-limit.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { pingRedis } from "./lib/redis.js";

let configured = false;

// Wires middleware and routes onto the shared Express app (the one Socket.IO is attached to).
// Kept separate from index.js so integration tests can boot the real app without starting the server.
export function configureApp() {
  if (configured) return { app, server };
  configured = true;

  if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));

  app.use(cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));

  app.use(express.json({ limit: "12mb" }));
  app.use(express.urlencoded({ limit: "12mb", extended: true }));
  app.use(cookieParser());
  app.use("/api", apiLimiter);

  app.get("/health", async (_req, res) => {
    res.status(200).json({ ok: true, redis: await pingRedis() });
  });
  app.use("/api/auth", authRoutes);
  app.use("/api/messages", messageRoute);
  app.use(notFound);
  app.use(errorHandler);

  return { app, server };
}
