import express from "express";
import dotenv from "dotenv"
import authRoutes from "./routes/auth-route.js";
import connectDB from "./lib/db.js";
import cookieParser from "cookie-parser"
import messageRoute from "./routes/message-route.js"
import cors from "cors";
import {app, server} from "./lib/socket.js"

dotenv.config()

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(cors({
    origin: CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use('/api/messages', messageRoute)

const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
    console.log(`Server is running at port: ${PORT}`);
    connectDB();
});
