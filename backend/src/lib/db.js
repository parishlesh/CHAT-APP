import mongoose from "mongoose";
import { logger } from "./logger.js";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    logger.info(`Connected to MongoDB: ${conn.connection.host}`);
  } catch (error) {
    logger.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
};

export default connectDB;
