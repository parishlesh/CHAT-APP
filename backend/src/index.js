import express from "express";
import dotenv from "dotenv"
import authRoutes from "./routes/auth-route.js";
import connectDB from "./lib/db.js";
import cookieParser from "cookie-parser"
import messageRoute from "./routes/message-route.js"
import cors from "cors";
import {app, server} from "./lib/socket.js"

dotenv.config()


app.use(cors({
    origin: "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
app.options("*", cors());


app.use(express.json());
app.use(cookieParser());

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use("/api/auth", authRoutes);
app.use('/api/messages', messageRoute)

app.use((req, res, next) => {
    console.log("Request Size:", req.headers['content-length']);
    next();
});


const PORT = process.env.PORT;

server.listen(PORT, () => {
    console.log(`Server is running at port: ${PORT}`);
    connectDB();
});
