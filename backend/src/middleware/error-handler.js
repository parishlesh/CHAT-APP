import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  const publicMessage = status >= 500 ? "Internal server error" : err.message;
  if (status >= 500 && process.env.NODE_ENV !== "test") logger.error(err.message);
  else if (process.env.NODE_ENV !== "test") logger.debug(err.message);
  if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test" && err.stack) logger.debug(err.stack);

  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid id." });
  }
  if (err.code === 11000) {
    return res.status(400).json({ message: "Already exists." });
  }
  res.status(status).json({ message: publicMessage || "Request failed." });
}

export function notFound(_req, res) {
  res.status(404).json({ message: "Not found." });
}

export { AppError };
