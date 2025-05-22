import React from "react";
import { useAuth } from "../store/useAuth";
import { Link } from "react-router-dom";
import { LogOut, User, Settings } from "lucide-react";
import { useThemeStore } from "../store/useThemeStore";

const Navbar = () => {
  const { isLogout, authUser } = useAuth();

  const { theme } = useThemeStore()

  return (
    <div
      className="fixed h-screen w-[20%] p-5 flex flex-col justify-between shadow-lg"
      data-theme={theme}
    >
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="avatar">
            <div className="w-12 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
              <img src={authUser.profilePic} />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-base-content">{authUser.fullName}</h2>
          </div>
        </div>

 
        <ul className="menu space-y-1">
          <li>
            <Link to="/" className="flex items-center gap-3 text-base-content hover:bg-base-300 rounded-lg px-3 py-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor"><path d="..." /></svg>
              Messages
              <span className="badge badge-sm badge-error ml-auto">14</span>
            </Link>
          </li>
          <li>
            <Link to="/privacy" className="flex items-center gap-3 text-base-content hover:bg-base-300 rounded-lg px-3 py-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor"><path d="..." /></svg>
              Privacy & Security
            </Link>
          </li>

        </ul>
      </div>

      <div className="space-y-2">
        <Link to="/settings" className="flex items-center gap-2 text-base-content hover:text-primary px-3 py-2 rounded-lg hover:bg-base-300">
          <Settings size={20} />

          Settings
        </Link>
        <Link to="/profile" className="flex items-center gap-2 text-base-content px-3 py-2 rounded-lg ">
          <User size={20} />
          <span>Profile</span>
        </Link>
        <button
          onClick={isLogout}
          className="flex items-center gap-2 text-red-500 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-base-300 transition"
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </div>


  );
};

export default Navbar;
