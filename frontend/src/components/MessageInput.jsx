import { useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { Send, Image as ImageIcon, XCircle } from "lucide-react";
import { useRef } from "react";

const MessageInput = () => {
  const [message, setMessage] = useState("");
  const [selectedImages, setSelectedImages] = useState();
  const fileInput = useRef(null)
  const { messages, setMessages } = useChatStore();

  const handleImageSelection = (event) => {
    const files = event.target.files[0];
    if (!fileInput.type.startsWith("image/")){
      toast.error("select an image file")
      return;
    }
    const reader = new FileReader();
    reader.onloadend = ()=>{
      setSelectedImages(reader.result)
    }
  };

  const removeImage = (index) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = async () => {
    if (!message.trim() && selectedImages.length === 0) return;
    
    const newMessage = {
      id: messages.length + 1,
      text: message,
      sender: "You",
      timestamp: new Date().toLocaleTimeString(),
      images: selectedImages,
    };
    
    setMessages([...messages, newMessage]);
    setMessage("");
    setSelectedImages([]);
  };

  return (
    <div className="flex flex-col p-4 bg-gray-200 rounded-lg w-full max-w-md">
      {selectedImages > 0 && (
        <div className="flex space-x-2 mb-2 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200 p-2">
          {selectedImages.map((image, index) => (
            <div key={index} className="relative flex-shrink-0 h-16 w-16">
              <img src={URL.createObjectURL(image)} alt="Preview" className="w-full h-full object-cover rounded-lg" />
              <button
                onClick={() => removeImage(index)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
              >
                <XCircle size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center space-x-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 p-2 rounded-lg border border-gray-300 focus:outline-none"
        />
        <label className="cursor-pointer bg-gray-300 p-2 rounded-lg hover:bg-gray-400">
          <ImageIcon size={20} />
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelection} />
        </label>
        <button
          onClick={handleSendMessage}
          className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
};

export default MessageInput;
