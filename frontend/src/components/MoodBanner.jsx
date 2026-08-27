import { getMoodMeta } from "../lib/moods";
import { useConversationThemeStore } from "../store/useConversationThemeStore";
import { useChatStore } from "../store/useChatStore";

const MoodBanner = () => {
  const { mine, theirs, openMoodPicker, isMoodLoading } = useConversationThemeStore();
  const selectedUser = useChatStore((state) => state.selectedUser);
  if (isMoodLoading || !selectedUser) return null;

  const myMood = getMoodMeta(mine?.mood);
  const theirMood = getMoodMeta(theirs?.mood);
  if (!myMood && !theirMood) {
    return (
      <div className="flex w-full items-center border-b border-base-300 px-3 py-1 text-xs text-base-content/80">
        <button type="button" onClick={openMoodPicker} className="hover:underline" aria-label="Change mood">
          🙂 How are you feeling?
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b border-base-300 px-3 py-1 text-xs text-base-content/80">
      {theirMood ? (
        <p>
          {theirMood.emoji} {selectedUser.fullName} is feeling {theirMood.label}
        </p>
      ) : <span />}
      {myMood ? (
        <p>
          {myMood.emoji} You&apos;re feeling {myMood.label}
          <button type="button" onClick={openMoodPicker} className="ml-2 font-medium text-primary hover:underline" aria-label="Change mood">
            Change
          </button>
        </p>
      ) : (
        <button type="button" onClick={openMoodPicker} className="hover:underline">
          🙂 How are you feeling?
        </button>
      )}
    </div>
  );
};

export default MoodBanner;
