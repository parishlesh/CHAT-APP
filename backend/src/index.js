import dotenv from "dotenv";
import connectDB from "./lib/db.js";
import { attachRedisAdapter } from "./lib/socket.js";
import { configureApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { connectRedis } from "./lib/redis.js";

dotenv.config();

const { server } = configureApp();
const PORT = process.env.PORT || 5001;

const start = async () => {
  await connectRedis();
  await attachRedisAdapter();
  server.listen(PORT, () => {
    logger.info(`Server is running at port: ${PORT}`);
    connectDB();
  });
};

start().catch((error) => {
  logger.error("Failed to start server:", error.message);
  process.exit(1);
});
