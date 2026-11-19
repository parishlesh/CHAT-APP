import { useEffect, useState } from "react";
import { Pin, X } from "lucide-react";
import toast from "react-hot-toast";
import { useChatStore } from "../store/useChatStore";
import { mediaLabel, mediaOf } from "../lib/media";

// Strip under the header showing pinned messages; tap to jump, tap again to cycle.
const PinnedBar = () => {
  const { pinnedMessages, unpinMessage } = useChatStore();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= pinnedMessages.length) setIndex(0);
  }, [pinnedMessages.length, index]);

  if (!pinnedMessages.length) return null;
  const pin = pinnedMessages[Math.min(index, pinnedMessages.length - 1)];
  const message = pin.message || {};
  const text = message.decryptStatus === "decrypted" && message.displayText
    ? message.displayText
    : mediaLabel(mediaOf(message)) || (message.decryptStatus === "failed" ? "Unable to decrypt this message" : "Pinned message");

  const jump = () => {
    const target = document.getElementById(`msg-${pin.messageId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("vl-flash");
      setTimeout(() => target.classList.remove("vl-flash"), 1200);
    } else {
      toast("That message is further back — scroll up to load it.");
    }
    if (pinnedMessages.length > 1) setIndex((value) => (value + 1) % pinnedMessages.length);
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-base-300 bg-base-100 px-3 py-1.5">
      <div className="flex flex-col gap-0.5" aria-hidden="true">
        {pinnedMessages.map((item, i) => (
          <span key={item.messageId} className={`h-2 w-0.5 rounded ${i === index ? "bg-primary" : "bg-base-300"}`} />
        ))}
      </div>
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={jump}>
        <Pin size={14} className="shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block text-[11px] font-medium text-primary">
            Pinned message{pinnedMessages.length > 1 ? ` ${index + 1} of ${pinnedMessages.length}` : ""}
          </span>
          <span className="block truncate text-xs text-base-content/70">{text}</span>
        </span>
      </button>
      <button type="button" className="shrink-0 rounded-full p-1 hover:bg-base-200" aria-label="Unpin message" onClick={() => unpinMessage(pin.messageId)}>
        <X size={14} />
      </button>
    </div>
  );
};

export default PinnedBar;
