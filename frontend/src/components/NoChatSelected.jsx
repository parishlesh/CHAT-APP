import BrandMark from "./BrandMark";

const NoChatSelected = () => {
  return (
    <div className="relative hidden h-full flex-col items-center justify-center overflow-hidden bg-base-200/40 px-6 text-center md:flex">
      <div className="pointer-events-none absolute h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <BrandMark size={56} showWordmark={false} className="relative mb-4" />
      <h2 className="relative text-lg font-medium text-base-content">Pick a conversation</h2>
      <p className="relative mt-1 max-w-xs text-sm text-base-content/60">
        Your VibeLink chats stay end-to-end encrypted on every device you use.
      </p>
    </div>
  );
};

export default NoChatSelected;
