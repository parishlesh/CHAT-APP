/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { ArrowLeft, Ban, Bell, BellOff, ChevronRight, Lock, LockOpen, Search, Smile, Trash2, X } from "lucide-react";
import PinInput from "./PinInput";
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
import OptionButton from "./OptionButton";
import { Link } from "react-router-dom";

const SHEET =
  "ui-sheet z-30 overflow-y-auto overscroll-contain border border-base-300 bg-base-100 pb-1 shadow-xl max-h-[min(85dvh,36rem)] w-full rounded-t-2xl fixed inset-x-0 bottom-0 safe-bottom sm:absolute sm:inset-auto sm:right-2 sm:top-14 sm:w-80 sm:max-h-[80vh] sm:rounded-xl sm:pt-1";

const Section = ({ title, children }) => (
  <div className="border-t border-base-300 py-2">
    <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-base-content/50">{title}</p>
    {children}
  </div>
);

const Row = ({ label, value, onClick, disabled }) => (
  <button type="button" disabled={disabled} className="ui-press flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-base-200 disabled:opacity-50" onClick={onClick}>
    <span>{label}</span>
    <span className="flex min-w-0 items-center gap-1 text-xs opacity-70"><span className="truncate">{value}</span><ChevronRight size={14} className="shrink-0" /></span>
  </button>
);

const ConversationSettings = ({ onClose, onSearch }) => {
  const {
    conversationVibe, relationshipType, relationshipCustom, myMode, appearance, conversationLocked,
    defaultDisappearing, rituals, memories, openVibePicker, patchConversationMeta, updateMyMode,
    updateAvailability, loadMemories, deleteMemory, upsertRitual, deleteRitual, selectedUser, setBlocked,
    lockChat, removeChatLock, setChatLockPin, deleteChat,
  } = useChatStore();
  const { mine, muted, openMoodPicker, setConversationMute } = useConversationThemeStore();
  const { authUser } = useAuth();
  const [view, setView] = useState("menu");
  const [busy, setBusy] = useState(false);
  const [customLabel, setCustomLabel] = useState(relationshipCustom);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const blockedByMe = (authUser?.blockedUsers || []).some((id) => String(id) === String(selectedUser?._id));
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
          <OptionButton
            key={item.key}
            selected={relationshipType === item.key}
            disabled={busy}
            onSelect={() => run(async () => {
              await patchConversationMeta({ relationshipType: item.key, relationshipCustom: item.key === "custom" ? customLabel : "" });
              if (item.key !== "custom") setView("menu");
            })}
            className="w-full px-3 py-2 text-left text-sm hover:bg-base-200"
          >
            <span>{item.emoji}</span> {item.label}
          </OptionButton>
        ))}
        {relationshipType === "custom" && (
          <form className="flex gap-2 px-3 py-2" onSubmit={(event) => { event.preventDefault(); run(() => patchConversationMeta({ relationshipType: "custom", relationshipCustom: customLabel })); }}>
            <input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} className="input input-sm input-bordered flex-1" placeholder="Custom label" maxLength={40} />
            <button type="submit" className="btn btn-sm btn-primary ui-press" disabled={busy}>Save</button>
          </form>
        )}
      </Panel>
    );
  }

  if (view === "mode") {
    return (
      <Panel onBack={() => setView("menu")} title="What do I need?">
        <button type="button" className="ui-press w-full px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => run(() => updateMyMode(null))}>Clear</button>
        {CONVERSATION_MODES.map((item) => (
          <OptionButton
            key={item.key}
            selected={myMode?.key === item.key}
            disabled={busy}
            onSelect={() => run(() => updateMyMode(item.key))}
            className="w-full px-3 py-2 text-left text-sm hover:bg-base-200"
          >
            {item.emoji} {item.label}
          </OptionButton>
        ))}
        <p className="px-3 pt-2 text-[11px] opacity-60">Optional expiration</p>
        {UNTIL_PRESETS.map((item) => (
          <OptionButton
            key={item.key}
            disabled={busy || !myMode?.key}
            onSelect={() => run(() => updateMyMode(myMode?.key, untilFromPreset(item.key)))}
            className="w-full px-3 py-1.5 text-left text-xs hover:bg-base-200"
          >
            {item.label}
          </OptionButton>
        ))}
      </Panel>
    );
  }

  if (view === "availability") {
    return (
      <Panel onBack={() => setView("menu")} title="Availability">
        <button type="button" className="ui-press w-full px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => run(() => updateAvailability(""))}>Clear</button>
        {AVAILABILITY_OPTIONS.map((item) => (
          <div key={item.key} className="border-b border-base-300/60">
            <OptionButton
              selected={false}
              disabled={busy}
              onSelect={() => run(() => updateAvailability(item.key))}
              className="w-full px-3 py-2 text-left text-sm hover:bg-base-200"
            >
              {item.emoji} {item.label}
            </OptionButton>
            <div className="flex flex-wrap gap-1 px-3 pb-2">
              {UNTIL_PRESETS.map((preset) => (
                <button key={preset.key} type="button" className="btn btn-ghost btn-xs ui-press" disabled={busy} onClick={() => run(() => updateAvailability(item.key, untilFromPreset(preset.key)))}>{preset.label}</button>
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
        <p className="px-3 text-[11px] opacity-60">Shared with {selectedUser?.fullName || "them"}. For a look only you see, use Settings → My vibe.</p>
        <p className="px-3 pt-2 text-xs font-medium">Wallpaper</p>
        {WALLPAPERS.map((item) => (
          <OptionButton
            key={item.key}
            selected={appearance?.wallpaper === item.key}
            disabled={busy}
            onSelect={() => run(() => patchConversationMeta({ appearance: { ...appearance, wallpaper: item.key } }))}
            className="w-full px-3 py-2 text-left text-sm hover:bg-base-200"
          >
            {item.label}
          </OptionButton>
        ))}
        <p className="px-3 pt-2 text-xs font-medium">Bubble style</p>
        {BUBBLE_STYLES.map((item) => (
          <OptionButton
            key={item.key}
            selected={appearance?.bubbleStyle === item.key}
            disabled={busy}
            onSelect={() => run(() => patchConversationMeta({ appearance: { ...appearance, bubbleStyle: item.key } }))}
            className="w-full px-3 py-2 text-left text-sm hover:bg-base-200"
          >
            {item.label}
          </OptionButton>
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
                {!existing && <button type="button" className="btn btn-xs ui-press" disabled={busy} onClick={() => run(() => upsertRitual({ key: item.key, recurrence: item.key === "weekly" ? "weekly" : "daily" }))}>Create</button>}
                {existing && <button type="button" className="btn btn-xs ui-press" disabled={busy} onClick={() => run(() => upsertRitual({ key: item.key, recurrence: existing.recurrence, paused: !existing.paused }))}>{existing.paused ? "Resume" : "Pause"}</button>}
                {existing && <button type="button" className="btn btn-xs btn-ghost ui-press" disabled={busy} onClick={() => run(() => deleteRitual(item.key))}>Delete</button>}
              </div>
            </div>
          );
        })}
      </Panel>
    );
  }

  if (view === "lock") {
    const hasPin = Boolean(authUser?.hasChatLockPin);
    const confirming = pinConfirm.length >= 4;
    // Three cases: remove an existing lock (needs PIN), create a PIN first, or just lock.
    if (conversationLocked) {
      return (
        <Panel onBack={() => setView("menu")} title="Remove chat lock">
          <form className="space-y-4 px-4 py-4 text-center" onSubmit={(event) => { event.preventDefault(); }}>
            <p className="text-sm text-base-content/70">Enter your PIN to stop locking this chat.</p>
            <PinInput
              value={pinDraft}
              onChange={(value) => { setPinDraft(value); setPinError(""); }}
              onComplete={(value) => run(async () => {
                const result = await removeChatLock(value);
                if (result.ok) { setPinDraft(""); setView("menu"); } else { setPinError(result.message); setPinDraft(""); }
              })}
              error={pinError}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm w-full normal-case"
              disabled={busy || pinDraft.length < 4}
              onClick={() => run(async () => {
                const result = await removeChatLock(pinDraft);
                if (result.ok) { setPinDraft(""); setView("menu"); } else { setPinError(result.message); setPinDraft(""); }
              })}
            >
              Remove lock
            </button>
          </form>
        </Panel>
      );
    }
    if (!hasPin) {
      return (
        <Panel onBack={() => { setView("menu"); setPinDraft(""); setPinConfirm(""); setPinError(""); }} title="Create a chat PIN">
          <form
            className="space-y-3 px-4 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (pinDraft !== pinConfirm) { setPinError("PINs don't match."); return; }
              run(async () => {
                const saved = await setChatLockPin({ pin: pinDraft });
                if (!saved.ok) { setPinError(saved.message); return; }
                setPinDraft(""); setPinConfirm("");
                await lockChat();
              });
            }}
          >
            <p className="text-sm text-base-content/70">You&apos;ll use this PIN to open any chat you lock, on every device. 4–6 digits.</p>
            <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoFocus placeholder="New PIN" value={pinDraft}
              onChange={(event) => { setPinDraft(event.target.value.replace(/\D/g, "").slice(0, 6)); setPinError(""); }}
              className="input input-bordered w-full tracking-[0.4em]" aria-label="New PIN" />
            <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder="Confirm PIN" value={pinConfirm}
              onChange={(event) => { setPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 6)); setPinError(""); }}
              className="input input-bordered w-full tracking-[0.4em]" aria-label="Confirm PIN" />
            {pinError && <p className="text-sm text-error">{pinError}</p>}
            <button type="submit" className="btn btn-primary btn-sm w-full normal-case" disabled={busy || pinDraft.length < 4 || !confirming}>
              Save PIN and lock chat
            </button>
          </form>
        </Panel>
      );
    }
    return (
      <Panel onBack={() => setView("menu")} title="Lock this chat?">
        <div className="space-y-3 px-4 py-4">
          <p className="text-sm text-base-content/70">
            Its messages and previews will be hidden until you enter your PIN. {selectedUser?.fullName} won&apos;t be told.
          </p>
          <button type="button" className="btn btn-primary btn-sm w-full gap-1.5 normal-case" disabled={busy} onClick={() => run(lockChat)}>
            <Lock size={14} /> Lock chat
          </button>
        </div>
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
                        <button type="button" className="ui-press text-[11px] text-error" onClick={() => run(() => deleteMemory(memory._id))}>Delete</button>
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
    <div className={SHEET}>
      <SheetHeader title="Chat settings" subtitle={selectedUser?.fullName} onClose={onClose} />
      <Section title="🎭 Conversation">
        <Row label="Vibe" value={`${vibe.emoji} ${vibe.label}`} onClick={() => { onClose(); openVibePicker(); }} />
        <Row label="Relationship type" value={relationship ? `${relationship.emoji} ${relationship.key === "custom" && relationshipCustom ? relationshipCustom : relationship.label}` : "Set"} onClick={() => setView("relationship")} />
        <Row label="Appearance" value={`${appearance?.wallpaper || "default"} · ${appearance?.bubbleStyle || "classic"}`} onClick={() => setView("appearance")} />
        <Link to="/settings" onClick={onClose} className="ui-press flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-base-200">
          <span>✨ My vibe</span>
          <span className="flex items-center gap-1 text-xs opacity-70">Colors, font, effects<ChevronRight size={14} /></span>
        </Link>
      </Section>
      <Section title="🙋 Me">
        <button type="button" className="ui-press flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => { onClose(); openMoodPicker(); }}>
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
        <button type="button" className="ui-press flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => run(() => patchConversationMeta({ defaultDisappearing: !defaultDisappearing }))}>
          <span>⏳ Disappearing messages</span>
          <span className="text-xs opacity-70">{defaultDisappearing ? "On" : "Off"}</span>
        </button>
        <button type="button" className="ui-press flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => { setConversationMute(selectedUser._id, !muted); }}>
          <span className="flex items-center gap-2">{muted ? <Bell size={16} /> : <BellOff size={16} />} {muted ? "Unmute" : "Mute"}</span>
        </button>
        <button type="button" className="ui-press flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => { setPinDraft(""); setPinConfirm(""); setPinError(""); setView("lock"); }}>
          <span className="flex items-center gap-2">{conversationLocked ? <LockOpen size={16} /> : <Lock size={16} />} {conversationLocked ? "Remove chat lock" : "Lock chat"}</span>
          <span className="text-xs opacity-70">{conversationLocked ? "PIN on" : "Off"}</span>
        </button>
        <button type="button" className="ui-press flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base-200" onClick={async () => { onClose(); await requestNotificationPermission(); }}>
          <Bell size={16} /> Desktop alerts
        </button>
        <button type="button" className="ui-press flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => { onClose(); onSearch(); }}>
          <Search size={16} /> Search
        </button>
        {blockedByMe ? (
          <button type="button" className="ui-press flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base-200" onClick={() => run(() => setBlocked(selectedUser._id, false))}>
            <Ban size={16} /> Unblock {selectedUser?.fullName}
          </button>
        ) : confirmBlock ? (
          <div className="px-3 py-2" ref={(node) => node?.scrollIntoView({ block: "nearest", behavior: "smooth" })}>
            <p className="text-xs">Block {selectedUser?.fullName}? They won&apos;t be able to message you, and you won&apos;t be able to message them.</p>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setConfirmBlock(false)}>Cancel</button>
              <button type="button" className="btn btn-error btn-xs" disabled={busy} onClick={() => run(async () => { await setBlocked(selectedUser._id, true); setConfirmBlock(false); })}>Block</button>
            </div>
          </div>
        ) : (
          <button type="button" className="ui-press flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-error hover:bg-base-200" onClick={() => setConfirmBlock(true)}>
            <Ban size={16} /> Block {selectedUser?.fullName}
          </button>
        )}
        {confirmDelete ? (
          <div className="px-3 py-2" ref={(node) => node?.scrollIntoView({ block: "nearest", behavior: "smooth" })}>
            <p className="text-xs">Delete this chat? Its messages are removed from your devices only — {selectedUser?.fullName} keeps their copy. If either of you sends a new message, the chat comes back empty.</p>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button type="button" className="btn btn-error btn-xs" disabled={busy} onClick={() => run(async () => { if (await deleteChat()) onClose(); })}>Delete chat</button>
            </div>
          </div>
        ) : (
          <button type="button" className="ui-press flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-error hover:bg-base-200" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} /> Delete chat
          </button>
        )}
      </Section>
    </div>
  );
};

// Grab handle on phones (where this is a bottom sheet), title, and a clear way out.
const SheetHeader = ({ title, subtitle, onBack, onClose }) => (
  <div className="sticky top-0 z-10 bg-base-100">
    <div className="mx-auto mb-1 mt-1.5 h-1 w-10 rounded-full bg-base-300 sm:hidden" aria-hidden="true" />
    <div className="flex items-center gap-1 px-2 pb-1.5">
      {onBack && (
        <button type="button" className="ui-press rounded-full p-1.5 hover:bg-base-200" aria-label="Back" onClick={onBack}>
          <ArrowLeft size={16} />
        </button>
      )}
      <div className="min-w-0 flex-1 px-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        {subtitle && <p className="truncate text-[11px] text-base-content/60">{subtitle}</p>}
      </div>
      {onClose && (
        <button type="button" className="ui-press rounded-full p-1.5 hover:bg-base-200" aria-label="Close" onClick={onClose}>
          <X size={16} />
        </button>
      )}
    </div>
  </div>
);

const Panel = ({ title, onBack, children }) => (
  <div className={SHEET}>
    <SheetHeader title={title} onBack={onBack} />
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
