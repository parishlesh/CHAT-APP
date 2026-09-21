import { useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../store/useAuth";
import BrandMark from "../components/BrandMark";
import AuthImagePattern from "../components/AuthImagePattern";

const ForgotPassword = () => {
  const { requestPasswordOtp, verifyPasswordOtp, commitPasswordChange } = useAuth();
  const [step, setStep] = useState("identifier");
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [userHint, setUserHint] = useState(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const fail = (err) => {
    const message = err?.response?.data?.message || err?.message || "Request failed.";
    setError(message);
    toast.error(message);
  };

  const run = async (task) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="flex items-center justify-center bg-base-200 px-4 py-8 sm:p-6">
        <div className="card w-full max-w-md bg-base-100 shadow-xl">
          <div className="card-body p-5 sm:p-8">
            <BrandMark size={36} className="mb-1 justify-center text-xl" />
            <h1 className="text-center text-2xl font-semibold">Reset password</h1>
            <p className="mb-2 text-center text-sm text-base-content/60">We will email a code to the registered address for this account.</p>

            {step === "identifier" && (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(async () => {
                    await requestPasswordOtp({ purpose: "PASSWORD_RESET", identifier });
                    setStep("otp");
                    toast.success("If an account matches the information provided, an OTP has been sent to the registered email.");
                  });
                }}
              >
                <div>
                  <label className="block text-sm font-medium">Email or username</label>
                  <input
                    className="input input-bordered mt-1 w-full text-base"
                    autoComplete="username"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send OTP"}</button>
              </form>
            )}

            {step === "otp" && (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(async () => {
                    if (!/^\d{6}$/.test(otp)) throw new Error("Invalid OTP");
                    const data = await verifyPasswordOtp({ purpose: "PASSWORD_RESET", identifier, otp });
                    setResetToken(data.resetToken);
                    setUserHint({ _id: data.userId });
                    setStep("password");
                  });
                }}
              >
                <p className="text-sm text-base-content/70">Enter the 6-digit code sent to the registered email.</p>
                {import.meta.env.DEV && <p className="text-xs text-base-content/50">Development code is 123456.</p>}
                <input
                  className="input input-bordered w-full text-base tracking-[0.4em]"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
                <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? "Verifying…" : "Verify OTP"}</button>
              </form>
            )}

            {step === "password" && !done && (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  run(async () => {
                    if (password !== confirm) throw new Error("Passwords do not match");
                    if (password.length < 6) throw new Error("Password does not meet requirements");
                    const result = await commitPasswordChange({ resetToken, newPassword: password, userHint });
                    setDone(true);
                    if (result.encryptionRecoveryRequired || !result.encryptionBackupPrepared) {
                      toast.success("Password reset. Sign in again. The previous encryption key could not be recovered on this device.");
                    } else {
                      toast.success("Password reset. Sign in with your new password.");
                    }
                  });
                }}
              >
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
                <button type="submit" className="btn btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Reset password"}</button>
              </form>
            )}

            {done && (
              <div className="space-y-3 text-center">
                <p className="text-sm">Your password was updated. Sign in with the new password to continue.</p>
                <Link to="/login" className="btn btn-primary w-full">Back to login</Link>
              </div>
            )}

            {error && <p className="mt-3 text-sm text-error">{error}</p>}
            <p className="mt-4 text-center text-sm text-base-content/60">
              Remembered it? <Link to="/login" className="link link-primary">Log in</Link>
            </p>
          </div>
        </div>
      </div>
      <AuthImagePattern
        title="Recover access, keep your identity"
        subtitle="A password reset does not create a new encryption identity. If this device still has your key, historical messages stay readable."
      />
    </div>
  );
};

export default ForgotPassword;
