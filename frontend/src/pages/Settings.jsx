import { useEffect } from "react";
import { THEMES } from "../cosntants";
import { useThemeStore } from "../store/useThemeStore";
import { ArrowLeft, MessageSquare, Settings as SettingsIcon, User } from "lucide-react";
import { Link } from "react-router-dom";
import ScrollContainer from "../components/scrollbarContainer";

const Settings = () => {
  const { appliedAppTheme, previewAppTheme, setPreviewAppTheme, resetPreviewAppTheme, applyAppTheme } = useThemeStore();

  useEffect(() => {
    resetPreviewAppTheme();
  }, [resetPreviewAppTheme]);

  const canApply = previewAppTheme !== appliedAppTheme;

  return (
    <ScrollContainer className="w-full h-full overflow-hidden">
      <div className="container mx-auto max-w-5xl px-4 py-6">
        <div className="space-y-6">
          <Link to="/" className="btn btn-ghost btn-sm w-fit md:hidden" aria-label="Back to messages">
            <ArrowLeft size={16} /> Messages
          </Link>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">App theme</h2>
            <p className="text-sm text-base-content/70">Preview a look for the rest of the app, then apply it. Conversations follow your Mood, not this setting.</p>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {THEMES.map((t) => (
              <button
                key={t}
                className={`
              group flex flex-col items-center gap-1.5 p-2 rounded-lg transition-colors
                ${previewAppTheme === t ? "bg-base-200" : "hover:bg-base-200/50"}
                `}
                onClick={() => setPreviewAppTheme(t)}
              >
                <div className="relative h-8 w-full rounded-md overflow-hidden" data-theme={t}>
                  <div className="absolute inset-0 grid grid-cols-4 gap-px p-1">
                    <div className="rounded bg-primary"></div>
                    <div className="rounded bg-secondary"></div>
                    <div className="rounded bg-accent"></div>
                    <div className="rounded bg-neutral"></div>
                  </div>
                </div>
                <span className="text-[11px] font-medium truncate w-full text-center">
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Preview</h3>
            <button type="button" className="btn btn-primary btn-sm" disabled={!canApply} onClick={applyAppTheme}>
              Apply
            </button>
          </div>
          <div className="rounded-xl border border-base-300 overflow-hidden bg-base-100 shadow-lg">
            <div className="p-4 bg-base-200">
              <div className="max-w-lg mx-auto overflow-hidden rounded-xl border border-base-300 shadow-sm" data-theme={previewAppTheme}>
                <div className="flex h-56 bg-base-100">
                  <div className="flex w-12 shrink-0 flex-col items-center gap-3 border-r border-base-300 bg-base-100 py-3">
                    <MessageSquare size={16} className="opacity-80" />
                    <User size={16} className="opacity-40" />
                    <SettingsIcon size={16} className="opacity-40" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="border-b border-base-300 px-3 py-2">
                      <p className="text-sm font-medium">Messages</p>
                      <p className="text-[11px] text-base-content/70">Sidebar and navigation follow App theme</p>
                    </div>
                    <div className="flex-1 space-y-2 bg-base-200 p-3">
                      <div className="rounded-lg bg-base-100 px-3 py-2">
                        <p className="text-xs font-medium">Alex</p>
                        <p className="text-[11px] text-base-content/70">Hey, are you free later?</p>
                      </div>
                      <div className="rounded-lg bg-base-100 px-3 py-2">
                        <p className="text-xs font-medium">Sam</p>
                        <p className="text-[11px] text-base-content/70">Sent a photo</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ScrollContainer>
  );
};
export default Settings;
