import express from "express";
import protectRoute from "../middleware/auth-middleware.js";
import { acceptRequest, deleteMessage, editMessage, getChats, getMessages, getRequests, getUsersForSidebar, rejectRequest, searchConversationMessages, searchUsers, sendMessage } from "../controllers/message-controller.js";

const router = express.Router();
router.get("/users", protectRoute, getUsersForSidebar);
router.get("/search", protectRoute, searchUsers);
router.get("/conversations", protectRoute, getChats);
router.get("/requests", protectRoute, getRequests);
router.put("/requests/:id/accept", protectRoute, acceptRequest);
router.put("/requests/:id/reject", protectRoute, rejectRequest);
router.get("/conversation/:conversationId/search", protectRoute, searchConversationMessages);
router.patch("/:messageId", protectRoute, editMessage);
router.delete("/:messageId", protectRoute, deleteMessage);
router.get("/:id", protectRoute, getMessages);
router.post("/send/:id", protectRoute, sendMessage);
export default router;
