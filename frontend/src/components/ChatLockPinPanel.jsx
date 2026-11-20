import { useState } from "react";
import { Lock } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../store/useAuth";
import { useChatStore } from "../store/useChatStore";

const digits = (value) => value.replace(/\D/g, "").slice(0, 6);

// Settings → set or change the PIN used for locked chats.
const ChatLockPinPanel = () => {
  const hasPin = useAuth((state) => Boolean(state.authUser?.hasChatLockPin));
  const setChatLockPin = useChatStore((state) => state.setChatLockPin);
  const [open, setOpen] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setOpen(false); setUsePassword(false); setCurrent(""); setPin(""); setConfirm(""); setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (pin !== confirm) return setError("PINs don't match.");
    setBusy(true);
    const result = await setChatLockPin({
      pin,
      ...(hasPin ? (usePassword ? { password: current } : { currentPin: current }) : {}),
    });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    toast.success(hasPin ? "Chat PIN changed" : "Chat PIN created");
    reset();
  };

  return (
    <section className="rounded-2xl border border-base-300 bg-base-100 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary"><Lock size={16} /></span>
          <div>
            <h2 className="font-semibold">Chat lock PIN</h2>
            <p className="text-sm text-base-content/60">
              {hasPin ? "Locked chats need this PIN to open, on every device." : "Create a PIN to lock individual chats from their settings."}
            </p>
          </div>
        </div>
        {!open && (
          <button type="button" className="btn btn-sm btn-ghost shrink-0 normal-case" onClick={() => setOpen(true)}>
            {hasPin ? "Change" : "Create"}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
          {hasPin && (
            <label className="sm:col-span-2">
              <span className="mb-1 flex items-center justify-between text-sm font-medium">
                {usePassword ? "Account password" : "Current PIN"}
                <button type="button" className="text-xs font-normal text-primary hover:underline" onClick={() => { setUsePassword((value) => !value); setCurrent(""); setError(""); }}>
                  {usePassword ? "Use current PIN" : "Forgot PIN?"}
                </button>
              </span>
              <input
                type="password"
                inputMode={usePassword ? "text" : "numeric"}
                autoComplete={usePassword ? "current-password" : "off"}
                value={current}
                onChange={(event) => setCurrent(usePassword ? event.target.value : digits(event.target.value))}
                className="input input-bordered w-full"
              />
            </label>
          )}
          <label>
            <span className="mb-1 block text-sm font-medium">New PIN (4–6 digits)</span>
            <input type="password" inputMode="numeric" value={pin} onChange={(event) => { setPin(digits(event.target.value)); setError(""); }} className="input input-bordered w-full tracking-[0.4em]" />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium">Confirm PIN</span>
            <input type="password" inputMode="numeric" value={confirm} onChange={(event) => { setConfirm(digits(event.target.value)); setError(""); }} className="input input-bordered w-full tracking-[0.4em]" />
          </label>
          {error && <p className="text-sm text-error sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn btn-ghost btn-sm normal-case" onClick={reset}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm normal-case" disabled={busy || pin.length < 4 || confirm.length < 4 || (hasPin && !current)}>
              {busy ? "Saving…" : "Save PIN"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};

export default ChatLockPinPanel;
