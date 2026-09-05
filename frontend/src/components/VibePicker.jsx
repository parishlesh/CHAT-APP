import { useEffect } from "react";
import { CONVERSATION_VIBES } from "../config/conversationVibes";
import { useChatStore } from "../store/useChatStore";
import OptionButton from "./OptionButton";

const VibePicker = () => {
  const { vibePickerOpen, closeVibePicker, conversationVibe, updateConversationVibe, isVibeSaving } = useChatStore();

  useEffect(() => {
    if (!vibePickerOpen) return;
    const onKey = (event) => { if (event.key === "Escape") closeVibePicker(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vibePickerOpen, closeVibePicker]);

  if (!vibePickerOpen) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close vibe picker" onClick={closeVibePicker} />
      <div
        className="ui-pop absolute left-2 right-2 top-14 z-30 max-h-72 overflow-y-auto rounded-lg border border-base-300 bg-base-100 py-1 shadow-md sm:left-auto sm:right-2 sm:w-56"
        role="dialog"
        aria-labelledby="vibe-picker-title"
      >
        <p id="vibe-picker-title" className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-base-content/50">
          Change vibe
        </p>
        {CONVERSATION_VIBES.map((vibe) => {
          const selected = conversationVibe === vibe.key;
          return (
            <OptionButton
              key={vibe.key}
              selected={selected}
              disabled={isVibeSaving}
              onSelect={() => updateConversationVibe(vibe.key)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-base-200 disabled:opacity-50 ${selected ? "bg-base-200" : ""}`}
            >
              <span>{vibe.emoji}</span>
              <span>{vibe.label}</span>
            </OptionButton>
          );
        })}
      </div>
    </>
  );
};

export default VibePicker;
