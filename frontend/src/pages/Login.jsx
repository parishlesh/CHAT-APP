import { useState } from "react";
import { useAuth } from "../store/useAuth.jsx";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import BrandMark from "../components/BrandMark";
import AuthImagePattern from "../components/AuthImagePattern";

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const { login, isLoggingIn } = useAuth();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await login(formData);
  };

  return (
    <div className="grid min-h-full lg:min-h-full lg:grid-cols-2">
      <div className="flex items-center justify-center bg-base-200 px-4 py-8 sm:p-6">
        <div className="card w-full max-w-md bg-base-100 shadow-xl">
          <div className="card-body p-5 sm:p-8">
            <BrandMark size={36} className="mb-1 justify-center text-xl" />
            <h1 className="text-center text-2xl font-semibold">Welcome back</h1>
            <p className="mb-2 text-center text-sm text-base-content/60">Sign in to continue your conversations</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium">Email or username</label>
                <input
                  type="text"
                  name="email"
                  autoComplete="username"
                  value={formData.email}
                  onChange={handleChange}
                  className="input input-bordered mt-1 w-full text-base"
                  placeholder="Enter your email or username"
                  required
                />
              </div>
              <div className="relative">
                <label className="block text-sm font-medium">Password</label>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  value={formData.password}
                  onChange={handleChange}
                  className="input input-bordered mt-1 w-full pr-10 text-base"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-9 text-base-content/50"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <button type="submit" className="btn btn-primary w-full ui-press" disabled={isLoggingIn}>
                {isLoggingIn ? "Logging in..." : "Login"}
              </button>
            </form>
            <p className="mt-3 text-center text-sm">
              <Link to="/forgot-password" className="link link-primary">
                Forgot password?
              </Link>
            </p>
            <p className="mt-4 text-center text-sm text-base-content/60">
              Don&apos;t have an account?{" "}
              <Link to="/signup" className="link link-primary">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
      <AuthImagePattern
        title="Stay in the conversation"
        subtitle="VibeLink keeps your messages encrypted across every device you sign in on — same identity, same chat."
      />
    </div>
  );
};

export default Login;
