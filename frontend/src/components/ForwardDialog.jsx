import { useEffect, useMemo, useState } from "react";
import { Check, Forward, Search, X } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuth } from "../store/useAuth";
import { mediaLabel, mediaOf } from "../lib/media";

const MAX_TARGETS = 5;

// Pick up to five existing chats to forward a message to.
const ForwardDialog = () => {
  const { forwarding, setForwarding, chatList, forwardMessage } = useChatStore();
  const blockedUsers = useAuth((state) => state.authUser?.blockedUsers);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!forwarding) return undefined;
    setPicked([]);
    setQuery("");
    const onKey = (event) => { if (event.key === "Escape") setForwarding(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [forwarding, setForwarding]);

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const blocked = new Set((blockedUsers || []).map(String));
    return chatList
      .filter((chat) => chat.status === "accepted" && chat.user && !blocked.has(String(chat.user._id)))
      .filter((chat) => !needle || chat.user.fullName?.toLowerCase().includes(needle) || chat.user.username?.toLowerCase().includes(needle));
  }, [chatList, query, blockedUsers]);

  if (!forwarding) return null;

  const toggle = (user) => {
    setPicked((current) => {
      if (current.some((item) => String(item._id) === String(user._id))) return current.filter((item) => String(item._id) !== String(user._id));
      if (current.length >= MAX_TARGETS) return current;
      return [...current, user];
    });
  };

  const send = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      await forwardMessage(forwarding, picked);
      setForwarding(null);
    } finally {
      setBusy(false);
    }
  };

  const preview = forwarding.displayText || mediaLabel(mediaOf(forwarding));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => setForwarding(null)}>
      <div
        className="ui-pop flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl bg-base-100 text-base-content shadow-xl safe-bottom sm:rounded-2xl"
        role="dialog"
        aria-labelledby="forward-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-base-300 px-4 py-3">
          <h3 id="forward-title" className="font-semibold">Forward to…</h3>
          <button type="button" className="rounded-full p-1 hover:bg-base-200" aria-label="Close" onClick={() => setForwarding(null)}><X size={18} /></button>
        </div>
        <p className="mx-4 mt-3 truncate rounded-lg bg-base-200 px-3 py-2 text-xs text-base-content/70">{preview}</p>
        <label className="relative mx-4 mt-3 block">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" className="w-full rounded-lg bg-base-200 py-2 pl-8 pr-3 text-sm outline-none" />
        </label>
        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-2">
          {candidates.map((chat) => {
            const selected = picked.some((item) => String(item._id) === String(chat.user._id));
            return (
              <li key={chat._id}>
                <button type="button" onClick={() => toggle(chat.user)} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-base-200 ${selected ? "bg-base-200" : ""}`}>
                  <img src={chat.user.profilePic || "/avatar.svg"} alt="" className="h-9 w-9 rounded-full object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{chat.user.fullName}</span>
                    <span className="block truncate text-xs opacity-60">@{chat.user.username}</span>
                  </span>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-content" : "border-base-300"}`}>
                    {selected && <Check size={12} />}
                  </span>
                </button>
              </li>
            );
          })}
          {!candidates.length && <li className="px-2 py-6 text-center text-sm opacity-60">No chats to forward to.</li>}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-base-300 px-4 py-3">
          <span className="text-xs opacity-60">{picked.length}/{MAX_TARGETS} selected</span>
          <button type="button" className="btn btn-primary btn-sm gap-1" disabled={!picked.length || busy} onClick={send}>
            <Forward size={14} /> {busy ? "Sending…" : "Forward"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForwardDialog;
