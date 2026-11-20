/* eslint-disable react/prop-types */
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Ban, Bell, BellOff, CalendarDays, Download, FileText, Heart, Lock, MessageCircle, Mic, Play, Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { useShallow } from "zustand/react/shallow";
import { axiosInstance } from "../lib/axios";
import { useAuth } from "../store/useAuth";
import { useChatStore } from "../store/useChatStore";
import { getMoodMeta } from "../lib/moods";
import { getVibeMeta } from "../config/conversationVibes";
import { RELATIONSHIP_TYPES, findMeta, formatAvailability } from "../config/conversationExtras";
import { downloadUrl, formatBytes, formatDuration, mediaOf } from "../lib/media";
import { formatLastSeen } from "../lib/time";

const MediaViewer = lazy(() => import("./MediaViewer"));

const TABS = [
  { key: "media", label: "Media" },
  { key: "files", label: "Docs" },
  { key: "voice", label: "Voice" },
];

const Card = ({ title, children, action }) => (
  <section className="rounded-2xl border border-base-300 bg-base-100 p-4">
    {(title || action) && (
      <div className="mb-3 flex items-center justify-between gap-2">
        {title && <h2 className="text-xs font-semibold uppercase tracking-wide text-base-content/50">{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </section>
);

const Fact = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3 py-1.5">
    <Icon size={16} className="mt-0.5 shrink-0 text-base-content/50" />
    <div className="min-w-0">
      <p className="text-[11px] text-base-content/50">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  </div>
);

const ActionButton = ({ icon: Icon, label, onClick, danger, disabled }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`ui-press flex min-w-[5.5rem] flex-1 flex-col items-center gap-1.5 rounded-xl border border-base-300 bg-base-100 px-3 py-3 text-xs font-medium hover:bg-base-200 disabled:opacity-50 ${danger ? "text-error" : ""}`}
  >
    <Icon size={20} className={danger ? "" : "text-primary"} />
    {label}
  </button>
);

const ProfileSkeleton = () => (
  <div className="mx-auto w-full max-w-2xl space-y-4 p-4" aria-hidden="true">
    <div className="flex flex-col items-center gap-3 py-6">
      <div className="h-28 w-28 animate-pulse rounded-full bg-base-300" />
      <div className="h-5 w-40 animate-pulse rounded bg-base-300" />
      <div className="h-3 w-24 animate-pulse rounded bg-base-200" />
    </div>
    <div className="h-24 animate-pulse rounded-2xl bg-base-200" />
    <div className="h-40 animate-pulse rounded-2xl bg-base-200" />
  </div>
);

// Contact info: who someone is (photo, bio, mood, status) and what you share (chat details, media).
const UserProfile = ({ userId }) => {
  const navigate = useNavigate();
  const myId = useAuth((state) => state.authUser?._id);
  const onlineUsers = useAuth((state) => state.onlineUsers);
  const { selectedUser, setSelectedUser, setBlocked, getUnlockHeaders, openViewer, viewer } = useChatStore(useShallow((state) => ({
    selectedUser: state.selectedUser,
    setSelectedUser: state.setSelectedUser,
    setBlocked: state.setBlocked,
    getUnlockHeaders: state.getUnlockHeaders,
    openViewer: state.openViewer,
    viewer: state.viewer,
  })));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("media");
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const { data: body } = await axiosInstance.get(`/messages/users/${userId}/profile`, { headers: getUnlockHeaders(userId) });
      setData(body);
      setError("");
    } catch (err) {
      setError(err.response?.status === 404 ? "This account doesn't exist." : err.response?.data?.message || "Couldn't load this profile.");
    }
  }, [userId, getUnlockHeaders]);

  useEffect(() => {
    if (String(userId) === String(myId)) {
      navigate("/profile", { replace: true });
      return;
    }
    setData(null);
    setItems([]);
    setTab("media");
    loadProfile();
  }, [userId, myId, navigate, loadProfile]);

  // Don't leave the photo viewer open behind when navigating back to the chat.
  useEffect(() => () => useChatStore.getState().closeViewer(), []);

  const loadItems = useCallback(async (kind, before) => {
    setLoadingItems(true);
    try {
      const { data: page } = await axiosInstance.get(`/messages/users/${userId}/media`, {
        params: { kind, limit: 30, ...(before ? { before } : {}) },
        headers: getUnlockHeaders(userId),
      });
      setItems((current) => (before ? [...current, ...page.items] : page.items));
      setHasMore(page.hasMore);
    } catch {
      if (!before) setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [userId, getUnlockHeaders]);

  useEffect(() => {
    if (data?.mediaCounts) loadItems(tab);
  }, [tab, data?.mediaCounts, loadItems]);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-base-content/70">{error}</p>
        <button type="button" className="btn btn-primary btn-sm normal-case" onClick={goBack}>Go back</button>
      </div>
    );
  }

  const profile = data?.profile;
  const relationship = data?.relationship;
  const online = profile && !profile.statusHidden && onlineUsers.some((id) => String(id) === String(profile._id));
  const status = !profile || profile.statusHidden ? "" : online ? "Online" : formatLastSeen(profile.lastSeen);
  const availability = profile ? formatAvailability(profile.availability) : null;
  const mood = getMoodMeta(profile?.mood);
  const vibe = relationship ? getVibeMeta(relationship.conversationVibe) : null;
  const relationshipMeta = relationship ? findMeta(RELATIONSHIP_TYPES, relationship.relationshipType) : null;
  const relationshipLabel = relationshipMeta
    ? `${relationshipMeta.emoji} ${relationshipMeta.key === "custom" && relationship.relationshipCustom ? relationship.relationshipCustom : relationshipMeta.label}`
    : null;
  const joined = profile?.joinedAt ? new Date(profile.joinedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "";
  const since = relationship?.since ? new Date(relationship.since).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

  const openChat = () => {
    const user = { _id: profile._id, fullName: profile.fullName, username: profile.username, profilePic: profile.profilePic };
    if (String(selectedUser?._id) !== String(profile._id)) setSelectedUser(user);
    navigate("/");
  };

  const toggleMute = async () => {
    setBusy(true);
    try {
      const { data: body } = await axiosInstance.put(`/messages/conversation/${profile._id}/mute`, { muted: !relationship.muted });
      setData((current) => ({ ...current, relationship: { ...current.relationship, muted: Boolean(body.muted) } }));
      useChatStore.setState((state) => ({
        chatList: state.chatList.map((chat) => String(chat.user?._id) === String(profile._id) ? { ...chat, muted: Boolean(body.muted) } : chat),
      }));
      toast.success(body.muted ? "Notifications muted" : "Notifications on");
    } catch (err) {
      toast.error(err.response?.data?.message || "Couldn't update notifications.");
    } finally {
      setBusy(false);
    }
  };

  const toggleBlock = async () => {
    setBusy(true);
    await setBlocked(profile._id, !data.blockedByMe);
    setConfirmBlock(false);
    await loadProfile();
    setBusy(false);
  };

  const counts = data?.mediaCounts;
  const totalShared = counts ? counts.media + counts.files + counts.voice : 0;

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-base-200/40">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-base-300 bg-base-100/95 px-2 backdrop-blur sm:h-16 sm:px-4">
        <button type="button" className="ui-press rounded-full p-2 hover:bg-base-200" aria-label="Back" onClick={goBack}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold">Contact info</h1>
      </header>

      {!data ? <ProfileSkeleton /> : (
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-10 safe-bottom">
          {/* Who they are */}
          <section className="flex flex-col items-center gap-1 rounded-2xl border border-base-300 bg-base-100 px-4 py-6 text-center">
            <button
              type="button"
              className="relative mb-2 rounded-full"
              disabled={!profile.profilePic}
              onClick={() => openViewer({ kind: "image", url: profile.profilePic, name: profile.fullName, senderName: profile.fullName })}
              aria-label="View profile photo"
            >
              <img src={profile.profilePic || "/avatar.svg"} alt="" className="h-28 w-28 rounded-full bg-base-200 object-cover sm:h-32 sm:w-32" />
              {online && <span className="absolute bottom-2 right-2 h-4 w-4 rounded-full bg-success ring-4 ring-base-100" aria-hidden="true" />}
            </button>
            <h2 className="max-w-full truncate text-2xl font-bold">{profile.fullName}</h2>
            <p className="text-sm text-base-content/60">@{profile.username}</p>
            {(status || availability) && (
              <p className={`text-sm ${online ? "text-success" : "text-base-content/60"}`}>
                {[status, availability].filter(Boolean).join(" · ")}
              </p>
            )}
            {mood && (
              <span className="mt-2 rounded-full bg-base-200 px-3 py-1 text-sm">{mood.emoji} Feeling {mood.label.toLowerCase()}</span>
            )}
            {profile.limited && (
              <p className="mt-3 max-w-sm text-xs text-base-content/50">Some details aren&apos;t available for this account.</p>
            )}
          </section>

          {/* What you can do */}
          {!data.isSelf && (
            <div className="flex flex-wrap gap-2">
              <ActionButton icon={MessageCircle} label="Message" onClick={openChat} disabled={data.blockedByMe} />
              {relationship && (
                <ActionButton icon={relationship.muted ? Bell : BellOff} label={relationship.muted ? "Unmute" : "Mute"} onClick={toggleMute} disabled={busy} />
              )}
              <ActionButton icon={Ban} label={data.blockedByMe ? "Unblock" : "Block"} danger={!data.blockedByMe} onClick={() => (data.blockedByMe ? toggleBlock() : setConfirmBlock(true))} disabled={busy} />
            </div>
          )}
          {confirmBlock && (
            <div className="ui-pop rounded-2xl border border-error/30 bg-error/5 p-4" ref={(node) => node?.scrollIntoView({ block: "nearest", behavior: "smooth" })}>
              <p className="text-sm">Block {profile.fullName}? They won&apos;t be able to message you, and they&apos;ll only see your name.</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className="btn btn-ghost btn-sm normal-case" onClick={() => setConfirmBlock(false)}>Cancel</button>
                <button type="button" className="btn btn-error btn-sm normal-case" disabled={busy} onClick={toggleBlock}>Block</button>
              </div>
            </div>
          )}

          {/* About them */}
          <Card title="About">
            <p className={`whitespace-pre-wrap text-sm ${profile.about ? "" : "text-base-content/50"}`}>
              {profile.about || (profile.limited ? "Not available" : "No bio yet")}
            </p>
            {joined && <Fact icon={CalendarDays} label="Joined VibeLink" value={joined} />}
          </Card>

          {/* You two */}
          {relationship && (
            <Card title="Your chat">
              {relationship.status === "pending" && (
                <p className="mb-2 rounded-lg bg-base-200 px-3 py-2 text-sm">
                  {String(relationship.initiatedBy) === String(myId) ? "Waiting for them to accept your request." : "They sent you a message request."}
                </p>
              )}
              {relationship.status === "declined" && (
                <p className="mb-2 rounded-lg bg-base-200 px-3 py-2 text-sm">
                  {String(relationship.initiatedBy) === String(myId) ? "They declined your request." : "You rejected their request. Only you can reopen this chat."}
                </p>
              )}
              {vibe && vibe.key !== "neutral" && <Fact icon={Sparkles} label="Vibe" value={`${vibe.emoji} ${vibe.label}`} />}
              {relationshipLabel && <Fact icon={Heart} label="Relationship" value={relationshipLabel} />}
              {since && relationship.status === "accepted" && <Fact icon={MessageCircle} label="Chatting since" value={since} />}
              {relationship.locked && <Fact icon={Lock} label="Chat lock" value="This chat is locked with your PIN" />}
            </Card>
          )}

          {/* Shared media */}
          {relationship && (
            <Card title={counts ? `Shared · ${totalShared}` : "Shared"}>
              {data.mediaHidden ? (
                <p className="flex items-center gap-2 text-sm text-base-content/60"><Lock size={14} /> Open the chat with your PIN to see shared media.</p>
              ) : (
                <>
                  <div className="mb-3 flex gap-1 rounded-full bg-base-200 p-1" role="tablist">
                    {TABS.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        role="tab"
                        aria-selected={tab === item.key}
                        onClick={() => setTab(item.key)}
                        className={`flex-1 rounded-full py-1.5 text-sm ${tab === item.key ? "bg-base-100 font-medium shadow-sm" : "text-base-content/60"}`}
                      >
                        {item.label} <span className="text-xs text-base-content/50">{counts?.[item.key] ?? 0}</span>
                      </button>
                    ))}
                  </div>

                  {!items.length && !loadingItems && (
                    <p className="py-6 text-center text-sm text-base-content/50">
                      {tab === "media" ? "No photos or videos yet." : tab === "files" ? "No documents yet." : "No voice messages yet."}
                    </p>
                  )}

                  {tab === "media" && items.length > 0 && (
                    <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
                      {items.map((item) => {
                        const media = mediaOf(item);
                        return (
                          <button
                            key={item._id}
                            type="button"
                            className="relative aspect-square overflow-hidden rounded-lg bg-base-200"
                            onClick={() => openViewer({ ...media, senderName: String(item.senderId) === String(myId) ? "You" : profile.fullName, createdAt: item.createdAt })}
                            aria-label={media.kind === "video" ? "Open video" : "Open photo"}
                          >
                            {media.kind === "video"
                              ? <video src={media.url} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                              : <img src={media.url} alt="" loading="lazy" className="h-full w-full object-cover" />}
                            {media.kind === "video" && (
                              <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white"><Play size={22} className="fill-white" /></span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {tab === "files" && items.length > 0 && (
                    <ul className="divide-y divide-base-300">
                      {items.map((item) => (
                        <li key={item._id}>
                          <a href={downloadUrl(item.attachment)} target="_blank" rel="noopener noreferrer" download={item.attachment?.name || true} className="flex items-center gap-3 py-2.5 hover:bg-base-200/60">
                            <FileText size={22} className="shrink-0 text-primary" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{item.attachment?.name || "File"}</span>
                              <span className="block text-xs text-base-content/50">
                                {[formatBytes(item.attachment?.bytes), new Date(item.createdAt).toLocaleDateString()].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                            <Download size={16} className="shrink-0 text-base-content/50" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}

                  {tab === "voice" && items.length > 0 && (
                    <ul className="space-y-2">
                      {items.map((item) => (
                        <li key={item._id} className="flex items-center gap-2 rounded-lg bg-base-200/60 px-2 py-1.5">
                          <Mic size={16} className="shrink-0 text-primary" />
                          <audio src={item.attachment?.url} controls preload="none" className="h-9 min-w-0 flex-1" />
                          <span className="shrink-0 text-[11px] text-base-content/50">
                            {item.attachment?.duration != null ? formatDuration(item.attachment.duration) : ""} {String(item.senderId) === String(myId) ? "· You" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {hasMore && (
                    <button type="button" className="btn btn-ghost btn-sm mt-3 w-full normal-case" disabled={loadingItems} onClick={() => loadItems(tab, items[items.length - 1]?._id)}>
                      {loadingItems ? "Loading…" : "Show more"}
                    </button>
                  )}
                </>
              )}
            </Card>
          )}

          {!relationship && !data.isSelf && (
            <p className="text-center text-sm text-base-content/50">You haven&apos;t chatted yet. Say hi to start a conversation.</p>
          )}
        </div>
      )}

      {viewer && <Suspense fallback={null}><MediaViewer /></Suspense>}
    </div>
  );
};

export default UserProfile;
