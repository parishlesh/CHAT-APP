import React from "react";
import { useAuth } from "../store/useAuth";
import { Link } from "react-router-dom";
import { LogOut, User } from "lucide-react";

const Navbar = () => {
  const { isLogout, authUser } = useAuth(); // Fixed function name to match `useAuth`

  return (
    <div className="flex items-center gap-4 p-4 bg-gray-100 shadow-md">
      {authUser && (
        <>
          <Link to="/profile" className="flex items-center gap-2 text-gray-700 hover:text-black">
            <User size={20} />
            <span>Profile</span>
          </Link>
          <button
            onClick={isLogout} // Call logout function
            className="flex items-center gap-2 text-red-500 hover:text-red-700"
          >
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </>
      )}
    </div>
  );
};

export default Navbar;
