import { useState } from "react";
import { Lock } from "lucide-react";
import { useChatStore } from "../store/useChatStore";
import PinInput from "./PinInput";

// Shown instead of the messages when a locked chat is opened. Nothing from the chat is loaded
// until the server accepts the PIN.
const ChatLockScreen = () => {
  const selectedUser = useChatStore((state) => state.selectedUser);
  const unlockChat = useChatStore((state) => state.unlockChat);
  const setChatLockPin = useChatStore((state) => state.setChatLockPin);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [password, setPassword] = useState("");
  const [newPin, setNewPin] = useState("");

  const submit = async (value = pin) => {
    if (busy || value.length < 4) return;
    setBusy(true);
    setError("");
    const result = await unlockChat(value);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      setPin("");
    }
  };

  const resetPin = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const saved = await setChatLockPin({ pin: newPin, password });
    if (!saved.ok) {
      setBusy(false);
      setError(saved.message);
      return;
    }
    const result = await unlockChat(newPin);
    setBusy(false);
    if (!result.ok) setError(result.message);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-10 text-center">
      <span className="rounded-full bg-primary/10 p-4 text-primary"><Lock size={28} /></span>
      <div>
        <h2 className="text-lg font-semibold">Chat locked</h2>
        <p className="mt-1 text-sm text-base-content/60">
          {forgot ? "Reset your chat PIN with your account password." : `Enter your PIN to open your chat with ${selectedUser?.fullName}.`}
        </p>
      </div>

      {forgot ? (
        <form onSubmit={resetPin} className="w-full max-w-xs space-y-3 text-left">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Account password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="input input-bordered w-full" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">New PIN (4–6 digits)</span>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={newPin}
              onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="input input-bordered w-full tracking-[0.4em]"
            />
          </label>
          {error && <p className="text-sm text-error">{error}</p>}
          <button type="submit" className="btn btn-primary w-full normal-case" disabled={busy || !password || newPin.length < 4}>
            {busy ? "Saving…" : "Reset PIN and unlock"}
          </button>
          <button type="button" className="btn btn-ghost btn-sm w-full normal-case" onClick={() => { setForgot(false); setError(""); }}>Back</button>
        </form>
      ) : (
        <form className="w-full max-w-xs space-y-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <PinInput value={pin} onChange={(value) => { setPin(value); setError(""); }} onComplete={submit} error={error} />
          <button type="submit" className="btn btn-primary w-full normal-case" disabled={busy || pin.length < 4}>
            {busy ? "Checking…" : "Unlock"}
          </button>
          <button type="button" className="text-sm text-primary hover:underline" onClick={() => { setForgot(true); setError(""); }}>Forgot PIN?</button>
        </form>
      )}
    </div>
  );
};

export default ChatLockScreen;
