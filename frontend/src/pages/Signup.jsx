import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, SkipForward } from "lucide-react";
import { useAuth } from "../store/useAuth";
import { axiosInstance } from "../lib/axios";
import BrandMark from "../components/BrandMark";

const steps = [
  { key: "fullName", label: "What's your name?", type: "text", placeholder: "Full name" },
  { key: "username", label: "Choose a username", type: "text", placeholder: "username" },
  { key: "email", label: "What's your email?", type: "email", placeholder: "you@example.com" },
  { key: "password", label: "Create a password", type: "password", placeholder: "At least 6 characters" },
  { key: "profilePic", label: "Add a profile picture", type: "file", optional: true },
  { key: "about", label: "Tell people about yourself", type: "textarea", placeholder: "A short bio", optional: true },
  { key: "phone", label: "Add your phone number", type: "tel", placeholder: "Phone number", optional: true },
];

const Signup = () => {
  const [step, setStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState("");
  const [formData, setFormData] = useState({ fullName: "", username: "", email: "", password: "", profilePic: "", about: "", phone: "" });
  const { isSignup, isSigningUp } = useAuth();
  const current = steps[step];

  useEffect(() => {
    if (current.key !== "username") return;
    const username = formData.username.trim();
    if (username.length < 3) return setUsernameStatus(username ? "Username must be at least 3 characters" : "");
    setUsernameStatus("Checking…");
    const timer = setTimeout(async () => {
      try {
        const { data } = await axiosInstance.get(`/auth/check-username/${encodeURIComponent(username)}`);
        setUsernameStatus(data.available ? "Available" : "This username is already taken");
      } catch { setUsernameStatus("Unable to check username"); }
    }, 350);
    return () => clearTimeout(timer);
  }, [current.key, formData.username]);

  const update = (value) => setFormData((previous) => ({ ...previous, [current.key]: value }));
  const validate = () => {
    const value = formData[current.key];
    if (current.optional) return true;
    if (!String(value).trim()) return toast.error(`${current.label} is required`);
    if (current.key === "username" && (usernameStatus !== "Available" || !/^[a-zA-Z0-9_]{3,30}$/.test(value))) return toast.error("Choose an available username (letters, numbers, and underscores only)");
    if (current.key === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return toast.error("Enter a valid email");
    if (current.key === "password" && value.length < 6) return toast.error("Password must be at least 6 characters");
    return true;
  };
  const next = async () => {
    if (!validate()) return;
    if (step === steps.length - 1) return isSignup(formData);
    setStep((value) => value + 1);
  };
  const onFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update(reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-base-200 px-4 py-8 sm:p-4">
      <div className="card w-full max-w-md bg-base-100 shadow-xl">
        <div className="card-body p-5 sm:p-8">
          <BrandMark size={32} className="mb-1 text-lg" />
          <p className="text-sm text-base-content/60">Step {step + 1} of {steps.length}</p>
          <progress className="progress progress-primary w-full" value={step + 1} max={steps.length} />
          <h1 className="card-title mt-3 text-xl sm:text-2xl">{current.label}</h1>
          <div className="py-3">
            {current.type === "file" ? (
              <>
                <input type="file" accept="image/*" onChange={onFile} className="file-input file-input-bordered w-full max-w-full" />
                {formData.profilePic && <img src={formData.profilePic} alt="Preview" className="mt-3 h-20 w-20 rounded-full object-cover" />}
              </>
            ) : current.type === "textarea" ? (
              <textarea value={formData.about} onChange={(e) => update(e.target.value)} placeholder={current.placeholder} className="textarea textarea-bordered w-full text-base" maxLength="250" />
            ) : (
              <div className="relative">
                <input
                  type={current.key === "password" && showPassword ? "text" : current.type}
                  name={current.key}
                  autoComplete={current.key === "password" ? "new-password" : current.key === "email" ? "email" : current.key === "username" ? "username" : "on"}
                  value={formData[current.key]}
                  onChange={(e) => update(e.target.value)}
                  placeholder={current.placeholder}
                  className="input input-bordered w-full pr-10 text-base"
                  autoFocus
                />
                {current.key === "password" && (
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3" aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                )}
              </div>
            )}
            {current.key === "username" && <p className={`mt-2 text-sm ${usernameStatus === "Available" ? "text-success" : "text-error"}`}>{usernameStatus}</p>}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            {step ? <button type="button" onClick={() => setStep((value) => value - 1)} className="btn btn-ghost w-full sm:w-auto"><ArrowLeft size={18}/> Back</button> : <span className="hidden sm:block" />}
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {current.optional && <button type="button" onClick={next} className="btn btn-ghost w-full sm:w-auto"><SkipForward size={18}/> Skip</button>}
              <button type="button" onClick={next} disabled={isSigningUp} className="btn btn-primary w-full sm:w-auto">
                {step === steps.length - 1 ? <><Check size={18}/> Create account</> : <>Continue <ArrowRight size={18}/></>}
              </button>
            </div>
          </div>
          <p className="mt-4 text-center text-sm">Already have an account? <Link to="/login" className="link link-primary">Log in</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
