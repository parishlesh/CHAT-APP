/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { Bell, BellOff, ChevronRight, Search, Smile } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import { useAuth } from "../store/useAuth";
import { useConversationThemeStore } from "../store/useConversationThemeStore";
import { getMoodMeta } from "../lib/moods";
import { getVibeMeta } from "../config/conversationVibes";
import {
  AVAILABILITY_OPTIONS, BUBBLE_STYLES, CONVERSATION_MODES, MEMORY_TYPES, RELATIONSHIP_TYPES,
  RITUALS, UNTIL_PRESETS, WALLPAPERS, findMeta, untilFromPreset,
} from "../config/conversationExtras";
import { requestNotificationPermission } from "../lib/notify";

const Section = ({ title, children }) => (
  <div className="border-t border-base-300 py-2">
    <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-base-content/50">{title}</p>
    {children}
  </div>
);

const Row = ({ label, value, onClick, disabled }) => (
  <button type="button" disabled={disabled} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-base-200 disabled:opacity-50" onClick={onClick}>
    <span>{label}</span>
    <span className="flex items-center gap-1 text-xs opacity-70">{value}<ChevronRight size={14} /></span>
  </button>
);

const ConversationSettings = ({ onClose, onSearch }) => {
  const {
    conversationVibe, relationshipType, relationshipCustom, myMode, appearance, conversationLocked,
    defaultDisappearing, rituals, memories, openVibePicker, patchConversationMeta, updateMyMode,
    updateAvailability, loadMemories, deleteMemory, upsertRitual, deleteRitual, selectedUser,
  } = useChatStore();
  const { mine, muted, openMoodPicker, setConversationMute } = useConversationThemeStore();
  const { authUser } = useAuth();
  const [view, setView] = useState("menu");
  const [busy, setBusy] = useState(false);
  const [customLabel, setCustomLabel] = useState(relationshipCustom);
  const myMood = getMoodMeta(mine?.mood);
  const vibe = getVibeMeta(conversationVibe);
  const relationship = findMeta(RELATIONSHIP_TYPES, relationshipType);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (view === "story") loadMemories();
  }, [view, loadMemories]);

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  if (view === "relationship") {
    return (
      <Panel onBack={() => setView("menu")} title="Relationship type">
        {RELATIONSHIP_TYPES.map((item) => (
          <button key={item.key} type="button" disabled={busy} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => run(async () => {
            await patchConversationMeta({ relationshipType: item.key, relationshipCustom: item.key === "custom" ? customLabel : "" });
            if (item.key !== "custom") setView("menu");
          })}>
            <span>{item.emoji}</span> {item.label}
          </button>
        ))}
        {relationshipType === "custom" && (
          <form className="flex gap-2 px-3 py-2" onSubmit={(event) => { event.preventDefault(); run(() => patchConversationMeta({ relationshipType: "custom", relationshipCustom: customLabel })); }}>
            <input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} className="input input-sm input-bordered flex-1" placeholder="Custom label" maxLength={40} />
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>Save</button>
          </form>
        )}
      </Panel>
    );
  }

  if (view === "mode") {
    return (
      <Panel onBack={() => setView("menu")} title="What do I need?">
        <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => run(() => updateMyMode(null))}>Clear</button>
        {CONVERSATION_MODES.map((item) => (
          <button key={item.key} type="button" disabled={busy} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => run(() => updateMyMode(item.key))}>
            {item.emoji} {item.label}
          </button>
        ))}
        <p className="px-3 pt-2 text-[11px] opacity-60">Optional expiration</p>
        {UNTIL_PRESETS.map((item) => (
          <button key={item.key} type="button" disabled={busy || !myMode?.key} className="w-full px-3 py-1.5 text-left text-xs hover:bg-base-200" onClick={() => run(() => updateMyMode(myMode?.key, untilFromPreset(item.key)))}>
            {item.label}
          </button>
        ))}
      </Panel>
    );
  }

  if (view === "availability") {
    return (
      <Panel onBack={() => setView("menu")} title="Availability">
        <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => run(() => updateAvailability(""))}>Clear</button>
        {AVAILABILITY_OPTIONS.map((item) => (
          <div key={item.key} className="border-b border-base-300/60">
            <button type="button" disabled={busy} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => run(() => updateAvailability(item.key))}>
              {item.emoji} {item.label}
            </button>
            <div className="flex flex-wrap gap-1 px-3 pb-2">
              {UNTIL_PRESETS.map((preset) => (
                <button key={preset.key} type="button" className="btn btn-ghost btn-xs" disabled={busy} onClick={() => run(() => updateAvailability(item.key, untilFromPreset(preset.key)))}>{preset.label}</button>
              ))}
            </div>
          </div>
        ))}
      </Panel>
    );
  }

  if (view === "appearance") {
    return (
      <Panel onBack={() => setView("menu")} title="Appearance">
        <p className="px-3 text-[11px] opacity-60">This is not Conversation Vibe or App Theme.</p>
        <p className="px-3 pt-2 text-xs font-medium">Wallpaper</p>
        {WALLPAPERS.map((item) => (
          <button key={item.key} type="button" disabled={busy} className="w-full px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => run(() => patchConversationMeta({ appearance: { ...appearance, wallpaper: item.key } }))}>{item.label}</button>
        ))}
        <p className="px-3 pt-2 text-xs font-medium">Bubble style</p>
        {BUBBLE_STYLES.map((item) => (
          <button key={item.key} type="button" disabled={busy} className="w-full px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => run(() => patchConversationMeta({ appearance: { ...appearance, bubbleStyle: item.key } }))}>{item.label}</button>
        ))}
      </Panel>
    );
  }

  if (view === "rituals") {
    return (
      <Panel onBack={() => setView("menu")} title="Rituals">
        {RITUALS.map((item) => {
          const existing = rituals.find((ritual) => ritual.key === item.key);
          return (
            <div key={item.key} className="px-3 py-2">
              <p className="text-sm">{item.emoji} {item.label}</p>
              <p className="text-[11px] opacity-60">{item.prompt}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {!existing && <button type="button" className="btn btn-xs" disabled={busy} onClick={() => run(() => upsertRitual({ key: item.key, recurrence: item.key === "weekly" ? "weekly" : "daily" }))}>Create</button>}
                {existing && <button type="button" className="btn btn-xs" disabled={busy} onClick={() => run(() => upsertRitual({ key: item.key, recurrence: existing.recurrence, paused: !existing.paused }))}>{existing.paused ? "Resume" : "Pause"}</button>}
                {existing && <button type="button" className="btn btn-xs btn-ghost" disabled={busy} onClick={() => run(() => deleteRitual(item.key))}>Delete</button>}
              </div>
            </div>
          );
        })}
      </Panel>
    );
  }

  if (view === "story") {
    const grouped = groupMemories(memories);
    return (
      <Panel onBack={() => setView("menu")} title="Our Story">
        {!memories.length && (
          <p className="px-3 py-4 text-sm opacity-70">No memories yet. Save something special from this conversation.</p>
        )}
        {grouped.map((yearGroup) => (
          <div key={yearGroup.year} className="px-3 py-2">
            <p className="text-xs font-semibold opacity-60">{yearGroup.year}</p>
            {yearGroup.months.map((month) => (
              <div key={month.label} className="mt-2">
                <p className="text-[11px] uppercase tracking-wide opacity-50">{month.label}</p>
                {month.items.map((memory) => {
                  const type = findMeta(MEMORY_TYPES, memory.type);
                  return (
                    <div key={memory._id} className="mt-1.5">
                      <p className="text-sm">{type?.emoji} {memory.title}</p>
                      <p className="text-[11px] opacity-60">{new Date(memory.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                      {memory.note && <p className="text-xs opacity-80">“{memory.note}”</p>}
                      {String(memory.createdBy) === String(authUser?._id) && (
                        <button type="button" className="text-[11px] text-error" onClick={() => run(() => deleteMemory(memory._id))}>Delete</button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </Panel>
    );
  }

  return (
    <div className="absolute right-2 top-12 z-30 max-h-[80vh] w-72 overflow-y-auto rounded-lg border border-base-300 bg-base-100 py-1 shadow-md">
      <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-base-content/50">Conversation settings</p>
      <Section title="🎭 Conversation">
        <Row label="Vibe" value={`${vibe.emoji} ${vibe.label}`} onClick={() => { onClose(); openVibePicker(); }} />
        <Row label="Relationship type" value={relationship ? `${relationship.emoji} ${relationship.key === "custom" && relationshipCustom ? relationshipCustom : relationship.label}` : "Set"} onClick={() => setView("relationship")} />
        <Row label="Appearance" value={`${appearance?.wallpaper || "default"} · ${appearance?.bubbleStyle || "classic"}`} onClick={() => setView("appearance")} />
      </Section>
      <Section title="🙋 Me">
        <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => { onClose(); openMoodPicker(); }}>
          <span className="flex items-center gap-2"><Smile size={16} /> Mood</span>
          <span className="text-xs opacity-70">{myMood ? `${myMood.emoji} ${myMood.label}` : "Set"}</span>
        </button>
        <Row label="What I need" value={myMode?.key ? `${findMeta(CONVERSATION_MODES, myMode.key)?.emoji || ""} ${findMeta(CONVERSATION_MODES, myMode.key)?.label || ""}` : "Optional"} onClick={() => setView("mode")} />
        <Row label="Availability" value="Quiet / Busy" onClick={() => setView("availability")} />
      </Section>
      <Section title="✨ Together">
        <Row label="Our Story" value="Memories" onClick={() => setView("story")} />
        <Row label="Rituals" value={rituals.length ? `${rituals.length}` : "None"} onClick={() => setView("rituals")} />
      </Section>
      <Section title="🔒 Privacy">
        <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => run(() => patchConversationMeta({ defaultDisappearing: !defaultDisappearing }))}>
          <span>⏳ Disappearing messages</span>
          <span className="text-xs opacity-70">{defaultDisappearing ? "On" : "Off"}</span>
        </button>
        <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => { setConversationMute(selectedUser._id, !muted); }}>
          <span className="flex items-center gap-2">{muted ? <Bell size={16} /> : <BellOff size={16} />} {muted ? "Unmute" : "Mute"}</span>
        </button>
        <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => run(() => patchConversationMeta({ locked: !conversationLocked }))}>
          <span>🔒 Lock conversation</span>
          <span className="text-xs opacity-70">{conversationLocked ? "On" : "Off"}</span>
        </button>
        <p className="px-3 pb-2 text-[10px] leading-snug opacity-50">Lock is a local reminder only. It is not biometric or device authentication.</p>
        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base-200" onClick={async () => { onClose(); await requestNotificationPermission(); }}>
          <Bell size={16} /> Desktop alerts
        </button>
        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => { onClose(); onSearch(); }}>
          <Search size={16} /> Search
        </button>
      </Section>
    </div>
  );
};

const Panel = ({ title, onBack, children }) => (
  <div className="absolute right-2 top-12 z-30 max-h-[80vh] w-72 overflow-y-auto rounded-lg border border-base-300 bg-base-100 py-1 shadow-md">
    <button type="button" className="px-3 py-2 text-xs opacity-70" onClick={onBack}>Back</button>
    <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-base-content/50">{title}</p>
    {children}
  </div>
);

const groupMemories = (memories) => {
  const years = new Map();
  memories.forEach((memory) => {
    const date = new Date(memory.createdAt);
    const year = date.getFullYear();
    const month = date.toLocaleString(undefined, { month: "long" }).toUpperCase();
    if (!years.has(year)) years.set(year, new Map());
    const months = years.get(year);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(memory);
  });
  return [...years.entries()].map(([year, months]) => ({
    year,
    months: [...months.entries()].map(([label, items]) => ({ label, items })),
  }));
};

export default ConversationSettings;
