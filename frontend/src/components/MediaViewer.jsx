import { useEffect } from "react";
import { Download, X } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { downloadUrl } from "../lib/media";
import { formatChatListTime, formatMessageTime } from "../lib/time";

// Full-screen photo/video viewer opened from a message bubble.
const MediaViewer = () => {
  const viewer = useChatStore((state) => state.viewer);
  const closeViewer = useChatStore((state) => state.closeViewer);

  useEffect(() => {
    if (!viewer) return undefined;
    const onKey = (event) => { if (event.key === "Escape") closeViewer(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer, closeViewer]);

  if (!viewer) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white" role="dialog" aria-label="Media viewer" onClick={closeViewer}>
      <div className="flex items-center justify-between gap-3 p-3 safe-top" onClick={(event) => event.stopPropagation()}>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{viewer.senderName}</p>
          {viewer.createdAt && (
            <p className="text-xs opacity-70">{formatChatListTime(viewer.createdAt)} · {formatMessageTime(viewer.createdAt)}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <a href={downloadUrl(viewer)} target="_blank" rel="noopener noreferrer" download={viewer.name || true} className="rounded-full p-2 hover:bg-white/10" aria-label="Download">
            <Download size={20} />
          </a>
          <button type="button" className="rounded-full p-2 hover:bg-white/10" aria-label="Close" onClick={closeViewer}>
            <X size={22} />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-2 safe-bottom">
        {viewer.kind === "video" ? (
          <video src={viewer.url} controls autoPlay playsInline className="max-h-full max-w-full" onClick={(event) => event.stopPropagation()} />
        ) : (
          <img src={viewer.url} alt={viewer.name || "Photo"} className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />
        )}
      </div>
    </div>
  );
};

export default MediaViewer;
