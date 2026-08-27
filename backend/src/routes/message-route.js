import express from "express";
import protectRoute from "../middleware/auth-middleware.js";
import { acceptRequest, deleteMessage, editMessage, getChats, getConversationMood, getMessages, getRequests, getUsersForSidebar, rejectRequest, searchConversationMessages, searchUsers, sendMessage, updateConversationMood } from "../controllers/message-controller.js";

const router = express.Router();
router.get("/users", protectRoute, getUsersForSidebar);
router.get("/search", protectRoute, searchUsers);
router.get("/conversations", protectRoute, getChats);
router.get("/requests", protectRoute, getRequests);
router.put("/requests/:id/accept", protectRoute, acceptRequest);
router.put("/requests/:id/reject", protectRoute, rejectRequest);
router.get("/conversation/:conversationId/search", protectRoute, searchConversationMessages);
router.get("/conversation/:userId/mood", protectRoute, getConversationMood);
router.put("/conversation/:userId/mood", protectRoute, updateConversationMood);
router.patch("/:messageId", protectRoute, editMessage);
router.delete("/:messageId", protectRoute, deleteMessage);
router.get("/:id", protectRoute, getMessages);
router.post("/send/:id", protectRoute, sendMessage);
export default router;
