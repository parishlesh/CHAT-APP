import { useState } from "react";
import { Eye, EyeOff, Shield } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../store/useAuth";

const passwordError = (error) => {
  const message = error?.response?.data?.message || error?.message || "Request failed.";
  if (/BACKUP_REWRAP_FAILED/i.test(message)) return "Unable to update encryption backup";
  return message;
};

const ChangePasswordPanel = () => {
  const { requestPasswordOtp, verifyPasswordOtp, commitPasswordChange, authUser } = useAuth();
  const [step, setStep] = useState("idle");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (task) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (err) {
      const message = passwordError(err);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = () => run(async () => {
    await requestPasswordOtp({ purpose: "PASSWORD_CHANGE" });
    setStep("otp");
    toast.success("If this account can receive mail, an OTP was sent to your registered email.");
  });

  const verify = () => run(async () => {
    if (!/^\d{6}$/.test(otp)) throw new Error("Invalid OTP");
    const data = await verifyPasswordOtp({ purpose: "PASSWORD_CHANGE", otp });
    setResetToken(data.resetToken);
    setStep("password");
  });

  const save = () => run(async () => {
    if (password !== confirm) throw new Error("Passwords do not match");
    if (password.length < 6) throw new Error("Password does not meet requirements");
    const result = await commitPasswordChange({
      resetToken,
      newPassword: password,
      userHint: authUser,
    });
    if (result.encryptionRecoveryRequired || !result.encryptionBackupPrepared) {
      toast.success("Password updated. Sign in again. This device could not refresh the encryption backup.");
    } else {
      toast.success("Password updated. Sign in with your new password.");
    }
  });

  return (
    <section className="rounded-xl border border-base-300 bg-base-100 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Shield size={18} />
        <div>
          <h2 className="text-lg font-semibold">Security</h2>
          <p className="text-sm text-base-content/70">Change your password. Your chat encryption identity stays the same.</p>
        </div>
      </div>

      {step === "idle" && (
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={sendOtp}>
          {busy ? "Sending code…" : "Change password"}
        </button>
      )}

      {step === "otp" && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            verify();
          }}
        >
          <p className="text-sm text-base-content/70">Enter the 6-digit code sent to your registered email.</p>
          {import.meta.env.DEV && <p className="text-xs text-base-content/50">Development code is 123456.</p>}
          <input
            className="input input-bordered w-full text-base tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="------"
            required
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Verifying…" : "Verify OTP"}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={sendOtp}>Resend</button>
          </div>
        </form>
      )}

      {step === "password" && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <p className="text-sm text-base-content/70">Choose a new password, then confirm it. You will be signed out on every device.</p>
          <div className="relative">
            <label className="block text-sm font-medium">New password</label>
            <input
              type={showPassword ? "text" : "password"}
              className="input input-bordered mt-1 w-full pr-10 text-base"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />
            <button type="button" className="absolute right-3 top-9 text-base-content/50" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium">Confirm new password</label>
            <input
              type={showPassword ? "text" : "password"}
              className="input input-bordered mt-1 w-full text-base"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              minLength={6}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-error">{error}</p>}
    </section>
  );
};

export default ChangePasswordPanel;
