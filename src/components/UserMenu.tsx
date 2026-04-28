import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

interface UserMenuProps {
  onLogout?: () => void;
}

const UserMenu: React.FC<UserMenuProps> = ({ onLogout }) => {
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const userEmail = localStorage.getItem("userEmail") || "";
  const storedName = localStorage.getItem("userName") || "";
  const storedAvatar = localStorage.getItem("userAvatar") || "";

  const userName = storedName || (userEmail ? userEmail.split("@")[0] : "Guest");

  const avatarUrl = useMemo(() => {
    if (storedAvatar) return storedAvatar;
    const seed = encodeURIComponent(userName || userEmail || "user");
    return `https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${seed}`;
  }, [storedAvatar, userEmail, userName]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSettings = () => {
    setIsOpen(false);
    navigate("/settings");
  };

  const handleLogout = () => {
    setIsOpen(false);
    // Clear all user data
    localStorage.removeItem("userEmail");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userName");
    localStorage.removeItem("userAvatar");
    localStorage.removeItem("userPhone");
    localStorage.removeItem("selectedCourse");
    localStorage.removeItem("selectedYear");
    localStorage.removeItem("selectedSubject");
    localStorage.removeItem("selectedTopic");
    // Navigate to login page
    navigate("/login");
    // Call parent logout if provided
    onLogout?.();
  };

  return (
    <div className="relative flex items-center gap-3" ref={menuRef}>
      <span className="text-white font-semibold text-sm sm:text-base whitespace-nowrap">
        {userName}
      </span>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center bg-white/10 hover:bg-white/15 border border-white/10 rounded-full p-1 transition duration-200"
      >
        <img
          src={avatarUrl}
          alt="User avatar"
          className="h-10 w-10 rounded-full border border-white/10"
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-14 w-48 bg-gray-900/90 backdrop-blur-xl border border-gray-700/60 rounded-2xl shadow-2xl overflow-hidden z-20">
          <div className="flex flex-col">
            <button
              onClick={handleSettings}
              className="flex items-center gap-2 px-4 py-3 text-gray-200 hover:bg-gray-800 text-sm transition"
            >
              <span role="img" aria-hidden="true">
                ⚙️
              </span>
              <span>Settings</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-3 text-red-300 hover:bg-red-900/40 text-sm transition"
            >
              <span role="img" aria-hidden="true">
                ↩️
              </span>
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
