import { useAuth } from "../store/useAuth";
import { Link, useLocation } from "react-router-dom";
import { LogOut, MessageSquare, User, Settings } from "lucide-react";
import { useThemeStore } from "../store/useThemeStore";
import BrandMark from "./BrandMark";

const Navbar = () => {
  const { isLogout, authUser } = useAuth();
  const { appliedAppTheme } = useThemeStore();
  const location = useLocation();
  if (!authUser) return null;

  const itemClass = (path) =>
    `ui-press flex items-center justify-center rounded-lg p-2 ${location.pathname === path ? "bg-base-300" : "hover:bg-base-300"}`;

  return (
    <nav
      className="hidden h-full w-16 shrink-0 flex-col items-center justify-between border-r border-base-300 bg-base-100 py-4 md:flex"
      data-theme={appliedAppTheme}
      aria-label="Main"
    >
      <div className="flex flex-col items-center gap-3">
        <Link to="/" className="ui-press rounded-lg p-1" aria-label="VibeLink messages">
          <BrandMark size={32} showWordmark={false} />
        </Link>
        <Link to="/" className={itemClass("/")} aria-label="Messages">
          <MessageSquare size={22} />
        </Link>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Link to="/settings" className={itemClass("/settings")} aria-label="Settings">
          <Settings size={20} />
        </Link>
        <Link to="/profile" className={itemClass("/profile")} aria-label="Profile">
          <User size={20} />
        </Link>
        <button type="button" onClick={isLogout} className="ui-press rounded-lg p-2 text-error hover:bg-base-300" aria-label="Logout">
          <LogOut size={20} />
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
