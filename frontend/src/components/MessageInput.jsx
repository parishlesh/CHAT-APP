import { useRef, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { Send, Image as ImageIcon, XCircle } from "lucide-react";

const MessageInput = () => {
  const [text, setText] = useState("");
  const [selectedImages, setSelectedImages] = useState([]);
  const { messages, sendMessage } = useChatStore();

  const fileInputRef = useRef(null)

  const handleImageSelection = (event) => {
    
    const files = Array.from(event.target.files);
    if(files.length=== 0 ) {
      return;
    }

    setSelectedImages((prev) => [...prev, ...files]);

    if(fileInputRef.current){
      fileInputRef.current.value ="";
    }
  };


  const removeImage = (index) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));

    if (selectedImages.length === 1 && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6);
          resolve(compressedDataUrl);
        };
      };
    });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() && selectedImages.length === 0) return;
    
    try {
      let imageData = null;
      
      if (selectedImages.length > 0) {
   
        imageData = await compressImage(selectedImages[0]);
        console.log("Compressed image size:", imageData.length);
        
        if (imageData.length > 10000000) { 
          toast.error("Image is still too large after compression. Please use a smaller image.");
          return;
        }
      }
  
      const messageData = {
        text: text.trim() || "",
        image: imageData,
      };
  
      await sendMessage(messageData);
      setText("");
      setSelectedImages([]);
    } catch (error) {
      console.error("Failed to send message: ", error);
      toast.error("Failed to send message. Please try again.");
    }
  };

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });
};

  return (
<div className="flex flex-col p-4 shadow-inner w-full">
  {selectedImages.length > 0 && (
    <div className="flex space-x-3 mb-3 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-200 p-2">
      {selectedImages.map((image, index) => (
        <div key={index} className="relative flex-shrink-0 h-16 w-16 rounded-lg overflow-hidden shadow-md">
          <img src={URL.createObjectURL(image)} alt="Preview" className="w-full h-full object-cover" />
          <button
            onClick={() => removeImage(index)}
            className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 shadow-lg transition"
          >
            <XCircle size={18} />
          </button>
        </div>
      ))}
    </div>
  )}
  <div className="flex items-center space-x-3">
    <input
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder="Type a message..."
      className="flex-1 p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition"
    />
    <label className="cursor-pointer bg-gray-200 p-3 rounded-lg hover:bg-gray-300 transition">
      <ImageIcon size={22} />
      <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelection} />
    </label>
    <button
      onClick={handleSendMessage}
      className="p-3 bg-primary text-primary-content rounded-lg hover:bg-primary-focus transition"
    >
      <Send size={22} />
    </button>
  </div>
</div>

  );
};

export default MessageInput;
