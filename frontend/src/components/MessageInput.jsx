import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store/useChatStore";
import { Image as ImageIcon, Send, Timer, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../store/useAuth";

const MessageInput = () => {
  const [text, setText] = useState("");
  const [selectedImages, setSelectedImages] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const [disappearing, setDisappearing] = useState(false);
  const { sendMessage, selectedUser, editingMessage, setEditingMessage, editMessage, replyingTo, setReplyingTo, sending, defaultDisappearing } = useChatStore();
  const { socket, authUser } = useAuth();
  const fileInputRef = useRef(null);
  const typingTimer = useRef(null);
  const textareaRef = useRef(null);

  const stopTyping = () => {
    clearTimeout(typingTimer.current);
    if (selectedUser && socket) socket.emit("stopTyping", { to: selectedUser._id, conversationId: selectedUser._id });
  };

  const resizeField = () => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 128)}px`;
  };

  const handleTyping = (value) => {
    setText(value);
    if (editingMessage) return;
    if (!selectedUser || !socket) return;
    socket.emit("typing", { to: selectedUser._id, conversationId: selectedUser._id });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, 1500);
  };

  useEffect(() => () => stopTyping(), [selectedUser, socket]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDisappearing(Boolean(defaultDisappearing));
  }, [selectedUser?._id, defaultDisappearing]);

  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.displayText || "");
      setSelectedImages([]);
      setPreviewUrls((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return [];
      });
      requestAnimationFrame(resizeField);
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  useEffect(() => { resizeField(); }, [text]);

  const handleImageSelection = (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    setSelectedImages((prev) => [...prev, ...files]);
    setPreviewUrls((prev) => [...prev, ...files.map((file) => URL.createObjectURL(file))]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index) => {
    setPreviewUrls((prev) => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
    if (selectedImages.length === 1 && fileInputRef.current) fileInputRef.current.value = "";
  };

  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.6));
        };
      };
    });
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setText("");
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (editingMessage) {
      if (!text.trim() || sending) return;
      await editMessage(editingMessage._id, text.trim());
      setText("");
      return;
    }
    if (sending || (!text.trim() && selectedImages.length === 0)) return;
    try {
      let imageData = null;
      if (selectedImages.length > 0) {
        imageData = await compressImage(selectedImages[0]);
        if (imageData.length > 10000000) {
          toast.error("Image is still too large after compression. Please use a smaller image.");
          return;
        }
      }
      await sendMessage({
        text: text.trim() || "",
        image: imageData,
        expiresAt: disappearing ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
      });
      stopTyping();
      setText("");
      setSelectedImages([]);
      setPreviewUrls((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return [];
      });
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch (error) {
      console.error("Failed to send message: ", error);
      toast.error("Failed to send message.");
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <form onSubmit={handleSendMessage} className="shrink-0 border-t border-base-300 bg-base-100 px-2 py-2 sm:px-3">
      {editingMessage && (
        <div className="mb-2 flex items-center justify-between rounded-md bg-base-200 px-3 py-1.5 text-xs">
          <span className="font-medium">Editing message</span>
          <button type="button" onClick={cancelEdit} aria-label="Cancel edit"><X size={16} /></button>
        </div>
      )}
      {replyingTo && !editingMessage && (
        <div className="mb-2 flex items-start justify-between gap-2 rounded-md border-l-2 border-primary bg-base-200 px-3 py-1.5 text-xs">
          <div className="min-w-0">
            <p className="font-medium">Replying to {replyingTo.senderId === authUser?._id ? "yourself" : selectedUser?.fullName}</p>
            <p className="truncate opacity-70">{replyingTo.displayText || (replyingTo.image ? "Photo" : "")}</p>
          </div>
          <button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply"><X size={16} /></button>
        </div>
      )}
      {selectedImages.length > 0 && !editingMessage && (
        <div className="mb-2 flex gap-2 overflow-x-auto">
          {selectedImages.map((image, index) => (
            <div key={index} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md">
              <img src={previewUrls[index]} alt="Preview" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute right-0.5 top-0.5 rounded-full bg-neutral/80 p-0.5 text-neutral-content"
                aria-label="Remove selected image"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1.5">
        {!editingMessage && (
          <>
            <label className="ui-press mb-0.5 cursor-pointer rounded-full p-2 hover:bg-base-200" aria-label="Attach image">
              <ImageIcon size={22} />
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelection} />
            </label>
            <button
              type="button"
              className={`ui-press mb-0.5 rounded-full p-2 ${disappearing ? "bg-primary text-primary-content" : "hover:bg-base-200"}`}
              aria-label="Toggle disappearing messages"
              aria-pressed={disappearing}
              title="Disappears 24 hours after sending"
              onClick={() => setDisappearing((value) => !value)}
            >
              <Timer size={20} />
            </button>
          </>
        )}
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => handleTyping(e.target.value)}
          onBlur={stopTyping}
          onKeyDown={onKeyDown}
          placeholder="Type a message"
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-base-300 bg-base-200 px-3 py-2 text-sm leading-5 outline-none focus:border-primary"
        />
        <button
          type="submit"
          className="mb-0.5 rounded-full bg-primary p-2 text-primary-content ui-press disabled:opacity-40"
          aria-label={editingMessage ? "Save edit" : "Send"}
          disabled={sending || (!text.trim() && selectedImages.length === 0)}
        >
          <Send size={20} />
        </button>
      </div>
    </form>
  );
};

export default MessageInput;
