import Navbar from './components/Navbar'
import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import { useAuth } from './store/useAuth'
import { Suspense, lazy, useEffect } from 'react'
import { Loader } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import { useThemeStore } from './store/useThemeStore'
import { usePersonalizationStore } from './store/usePersonalizationStore'
import BrandMark from './components/BrandMark'
import EncryptionRecoveryBanner from './components/EncryptionRecoveryBanner'

// Pages you don't need on first load are fetched on demand to keep the initial download small.
const Signup = lazy(() => import('./pages/Signup'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const Settings = lazy(() => import('./pages/Settings'))
const Profile = lazy(() => import('./pages/Profile'))

const PageFallback = () => (
  <div className="flex h-full items-center justify-center"><Loader className="size-6 animate-spin text-primary" /></div>
)

const App = () => {
  const { authUser, checkAuth, isCheckingAuth } = useAuth();
  const { appliedAppTheme } = useThemeStore();
  const loadPersonalization = usePersonalizationStore((state) => state.loadFor);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", appliedAppTheme);
  }, [appliedAppTheme]);

  useEffect(() => {
    loadPersonalization(authUser?._id || null);
  }, [authUser?._id, loadPersonalization]);

  if (isCheckingAuth && !authUser) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-base-200 px-4">
        <BrandMark size={44} className="text-2xl" />
        <Loader className="size-8 animate-spin text-primary" />
        <p className="text-sm text-base-content/60">Restoring your secure session…</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-full min-w-0 flex-col overflow-hidden safe-top" data-theme={appliedAppTheme}>
      {authUser && <EncryptionRecoveryBanner />}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {authUser && <Navbar />}
      <div
        className={`min-h-0 min-w-0 flex-1 ${authUser ? "overflow-hidden" : "overflow-y-auto overscroll-contain"}`}
        data-theme={appliedAppTheme}
      >
        <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Home stays mounted between the chat list and a contact's profile, so switching is instant. */}
          <Route element={authUser ? <Home /> : <Navigate to="/login" />}>
            <Route index element={null} />
            <Route path="u/:userId" element={null} />
          </Route>
          <Route path="/signup" element={!authUser ? <Signup /> : <Navigate to="/" />} />
          <Route path="/login" element={!authUser ? <Login /> : <Navigate to="/" />} />
          <Route path="/forgot-password" element={!authUser ? <ForgotPassword /> : <Navigate to="/" />} />
          <Route path="/settings" element={authUser ? <Settings /> : <Navigate to="/login" />} />
          <Route path="/profile" element={authUser ? <Profile /> : <Navigate to="/login" />} />
        </Routes>
        </Suspense>
      </div>
      </div>
      <Toaster
        position="top-center"
        containerStyle={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
        toastOptions={{ className: "!max-w-[calc(100vw-1.5rem)] text-sm" }}
      />
    </div>
  );
};

export default App;
