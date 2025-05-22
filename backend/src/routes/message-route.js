import express from "express";
import protectRoute from "../middleware/auth-middleware.js";
import {getUsersForSidebar, getMessage, sendMessage, getchats} from "../controllers/message-controller.js";

const router = express.Router()

router.get('/users', protectRoute, getUsersForSidebar)
router.get("/conversations", protectRoute, getchats);
router.get("/:id", protectRoute, getMessage)

router.post("/send/:id", protectRoute, sendMessage)


export default router