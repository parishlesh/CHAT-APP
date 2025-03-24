import cloudinary from "../lib/cloudinary.js";
import Message from "../models/message-model.js";
import User from "../models/user-model.js";

export const getUsersForSidebar = async(req, res)=>{
try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({_id: {$ne:loggedInUserId}}).select("-password")

    res.status(200).json(filteredUsers);
} catch (error) {
    cosnole.error("error in getUserForSidebar: ",error.message)
    res.status(500).json({message: "internal server error"});
}
}

export const getMessage=async (req, res) => {
    try {
       const {id:userToChatId} =  req.params
       const myId = req.user._id;

       const message = await Message.find({
        $or:[
            {senderId:myId, receiverId:userToChatId},
            {senderId:userToChatId, receiverId:myId}
        ]
       })

       res.status(200).json(message);
    } catch (error) {
        cosnole.error("error in getMessage controller: ",error.message)
        res.status(500).json({message: "internal server error"});
    }
}

export const sendMessage = async (req, res) => {
    try {
        const {text, image} = req.body;
        const {id: receiverId} = req.params;

        const senderId = req.user._id;

        console.log("Received data:", { text, image: image ? "Image exists" : "No image" });

        if (!text?.trim() && !image) {
            return res.status(400).json({ message: "Message text or image is required." });
        }

        let imgUrl;
        
        if (image) {

            try {
                
                console.log("Uploading image to Cloudinary...");
                const uploadResponse = await cloudinary.uploader.upload(image,{
                    folder: "chat-images",
                    resource_type: "image",
                });
                 imgUrl = uploadResponse.secure_url;
                console.log("Cloudinary upload success:", imgUrl);
            }
            catch (uploadError) {
                console.error("claudnary error: ", uploadError.message);
                return res.status(500).json({message: "failed to upload image"})      
            }
        }

        const newMessage = new Message({
            senderId,
            receiverId,
            text,
            image:imgUrl
        })

        await newMessage.save();

        //todo: realtime functionality goes here from socket.io


        res.status(201).json(newMessage)

    } catch (error) {
        res.status(500).json({message: "internal server error"});
         cosnole.error("error in sendMessage controller: ",error.message)
    }
}


