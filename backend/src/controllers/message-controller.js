import cloudinary from "../lib/cloudinary.js";
import Message from "../models/message-model.js";
import User from "../models/user-model.js";
import { io } from "../lib/socket.js";
import { getReceiverSocketId } from "../lib/socket.js";



export const getUsersForSidebar = async (req, res) => {
    try {
        const loggedInUserId = req.user._id;
        const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password")

        res.status(200).json(filteredUsers);
    } catch (error) {
        console.error("error in getUserForSidebar: ", error.message)
        res.status(500).json({ message: "internal server error" });
    }
}

export const getMessage = async (req, res) => {
    try {
        const { id: userToChatId } = req.params
        const myId = req.user._id;

        const message = await Message.find({
            $or: [
                { senderId: myId, receiverId: userToChatId },
                { senderId: userToChatId, receiverId: myId }
            ]
        })

        res.status(200).json(message);
    } catch (error) {
        console.error("error in getMessage controller: ", error.message)
        res.status(500).json({ message: "internal server error" });
    }
}

export const sendMessage = async (req, res) => {
    try {
        const { text, image } = req.body;
        const { id: receiverId } = req.params;

        const senderId = req.user._id;

        console.log("Received data:", { text, image: image ? "Image exists" : "No image" });

        if (!text?.trim() && !image) {
            return res.status(400).json({ message: "Message text or image is required." });
        }

        let imgUrl;

        console.log("Cookies:", req.cookies); 
        console.log("User from middleware:", req.user);


        if (image) {

            try {

                console.log("Uploading image to Cloudinary...");
                const uploadResponse = await cloudinary.uploader.upload(image, {
                    folder: "chat-images",
                    resource_type: "image",
                });
                imgUrl = uploadResponse.secure_url;
                console.log("Cloudinary upload success:", imgUrl);
            }
            catch (uploadError) {
                console.error("claudnary error: ", uploadError.message);
                return res.status(500).json({ message: "failed to upload image" })
            }
        }

        const newMessage = new Message({
            senderId,
            receiverId,
            text,
            image: imgUrl
        })

        await newMessage.save();

        const receiverSocketId = getReceiverSocketId(receiverId.toString());
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("newMessage", newMessage);
        }


        res.status(201).json(newMessage)

    } catch (error) {
        res.status(500).json({ message: "internal server error" });
        console.error("error in sendMessage controller: ", error.message)
    }
}

export const getchats = async (req, res) => {
    try {
        const myId = req.user._id;

        const messages = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { senderId: myId },
                        { receiverId: myId }
                    ]
                }
            },

            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ["$senderId", myId] },
                            "$receiverId",
                            "$senderId",
                        ],
                    },
                    messageId: { $first: "$_id" },
                    text: { $first: "$text" },
                    image: { $first: "$image" },
                    createdAt: { $first: "$createdAt" },
                },
            },
            {
                $sort: { createdAt: -1 },
            },
        ]);
        const populated = await Promise.all(
            messages.map(async (msg) => {
                const user = await User.findById(msg._id).select("-password");
                return {
                    user,
                    lastMessage: {
                        text: msg.text,
                        image: msg.image,
                        createdAt: msg.createdAt,
                    },
                };
            })
        );

        res.status(200).json(populated);

    } catch (error) {
        console.error("error in getchats controller: ", error.message)
        res.status(500).json({ message: "internal server error" });
    }
}