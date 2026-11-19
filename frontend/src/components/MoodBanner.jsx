import { getMoodMeta } from "../lib/moods";
import { useConversationThemeStore } from "../store/useConversationThemeStore";
import { useChatStore } from "../store/useChatStore";

// Their mood now lives in the chat header, so this only nudges you to set your own when you haven't.
const MoodBanner = () => {
  const { mine, openMoodPicker, isMoodLoading } = useConversationThemeStore();
  const selectedUser = useChatStore((state) => state.selectedUser);
  if (isMoodLoading || !selectedUser || getMoodMeta(mine?.mood)) return null;

  return (
    <button
      type="button"
      onClick={openMoodPicker}
      className="flex w-full shrink-0 items-center gap-2 border-b border-base-300 bg-base-100 px-3 py-1.5 text-left text-xs text-base-content/80 hover:bg-base-200/60"
    >
      <span aria-hidden="true">🙂</span>
      <span className="flex-1">How are you feeling? <span className="font-medium text-primary">Set your mood</span></span>
    </button>
  );
};

export default MoodBanner;
