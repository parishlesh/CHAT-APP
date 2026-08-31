import Navbar from './components/Navbar'
import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Signup from './pages/Signup'
import Login from './pages/Login'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import { useAuth } from './store/useAuth'
import { useEffect } from 'react'
import { Loader } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import { useThemeStore } from './store/useThemeStore'
import BrandMark from './components/BrandMark'

const App = () => {
  const { authUser, checkAuth, isCheckingAuth } = useAuth();
  const { appliedAppTheme } = useThemeStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", appliedAppTheme);
  }, [appliedAppTheme]);

  if (isCheckingAuth && !authUser) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-base-200">
        <BrandMark size={44} className="text-2xl" />
        <Loader className="size-8 animate-spin text-primary" />
        <p className="text-sm text-base-content/60">Restoring your secure session…</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden" data-theme={appliedAppTheme}>
      {authUser && <Navbar />}
      <div
        className={`min-h-0 min-w-0 flex-1 ${authUser ? "overflow-hidden" : "overflow-y-auto"}`}
        data-theme={appliedAppTheme}
      >
        <Routes>
          <Route path="/" element={authUser ? <Home /> : <Navigate to="/login" />} />
          <Route path="/signup" element={!authUser ? <Signup /> : <Navigate to="/" />} />
          <Route path="/login" element={!authUser ? <Login /> : <Navigate to="/" />} />
          <Route path="/settings" element={authUser ? <Settings /> : <Navigate to="/login" />} />
          <Route path="/profile" element={authUser ? <Profile /> : <Navigate to="/login" />} />
        </Routes>
      </div>
      <Toaster />
    </div>
  );
};

export default App;
