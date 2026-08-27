import { MOOD_OPTIONS, getMoodMeta } from "../lib/moods";
import { useConversationThemeStore } from "../store/useConversationThemeStore";
import { useChatStore } from "../store/useChatStore";

const MoodPicker = () => {
  const { isPickerOpen, closeMoodPicker, setConversationMood, mine, isMoodSaving } = useConversationThemeStore();
  const selectedUser = useChatStore((state) => state.selectedUser);
  if (!isPickerOpen || !selectedUser) return null;

  const current = getMoodMeta(mine?.mood);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeMoodPicker}>
      <div
        className="w-full max-w-sm rounded-2xl bg-base-100 p-4 shadow-xl text-base-content"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="mood-picker-title"
      >
        <h3 id="mood-picker-title" className="text-base font-semibold">How are you feeling?</h3>
        <p className="mt-1 text-xs opacity-70">Friends see this in every chat. It does not change the conversation vibe or app theme.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {MOOD_OPTIONS.map((option) => {
            const selected = current?.id === option.id;
            return (
              <button
                key={option.id}
                type="button"
                disabled={isMoodSaving}
                onClick={() => setConversationMood(selectedUser._id, option.id)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
                  selected ? "border-primary bg-primary/10" : "border-base-300 hover:bg-base-200"
                }`}
              >
                <span className="text-lg">{option.emoji}</span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" className="btn btn-ghost btn-sm" onClick={closeMoodPicker} aria-label="Close">Close</button>
        </div>
      </div>
    </div>
  );
};

export default MoodPicker;
