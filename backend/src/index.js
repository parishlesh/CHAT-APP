import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth-route.js";
import connectDB from "./lib/db.js";
import messageRoute from "./routes/message-route.js";
import { app, server } from "./lib/socket.js";
import { isOriginAllowed } from "./lib/origins.js";
import { apiLimiter } from "./middleware/rate-limit.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";
import { logger } from "./lib/logger.js";

dotenv.config();

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

app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoute);
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
  logger.info(`Server is running at port: ${PORT}`);
  connectDB();
});
