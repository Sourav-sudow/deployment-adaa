import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import UserMenu from "./UserMenu";

const SettingsPage = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(localStorage.getItem("userName") || "");
  const [phone, setPhone] = useState(localStorage.getItem("userPhone") || "");
  const userEmail = localStorage.getItem("userEmail") || "";
  const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isLoggedIn) {
      navigate("/login");
    }
  }, [isLoggedIn, navigate]);

  const avatarUrl = useMemo(() => {
    const storedAvatar = localStorage.getItem("userAvatar");
    if (storedAvatar) return storedAvatar;
    const seed = encodeURIComponent(fullName || userEmail || "user");
    return `https://api.dicebear.com/7.x/notionists-neutral/svg?seed=${seed}`;
  }, [fullName, userEmail]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = fullName.trim() || (userEmail ? userEmail.split("@")[0] : "");
    const sanitizedPhone = phone.replace(/\D/g, "").slice(0, 10);

    setFullName(trimmedName);
    setPhone(sanitizedPhone);

    localStorage.setItem("userName", trimmedName);
    localStorage.setItem("userPhone", sanitizedPhone);
    localStorage.setItem("userAvatar", avatarUrl);

    setMessage("Changes saved");
    setTimeout(() => setMessage(""), 2500);
  };

  const handleLogout = () => {
    localStorage.removeItem("userEmail");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("selectedCourse");
    localStorage.removeItem("selectedYear");
    localStorage.removeItem("selectedSubject");
    localStorage.removeItem("selectedTopic");
    navigate("/login");
  };

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
          >
            ← Back
          </button>
          <div>
            <p className="text-xs text-gray-500">Account</p>
            <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
          </div>
        </div>
        <UserMenu onLogout={handleLogout} />
      </header>

      <main className="flex justify-center px-4 py-10">
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-md p-8">
          <div className="text-center mb-8">
            <div className="mx-auto h-24 w-24 rounded-full overflow-hidden border border-gray-200 shadow-sm">
              <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
            </div>
            <h2 className="mt-4 text-2xl font-semibold text-gray-900">{fullName || "Your Name"}</h2>
            {userEmail ? <p className="text-gray-500 text-sm">{userEmail}</p> : null}
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="Sourav Kumar"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                placeholder="9654679617"
              />
              <p className="text-xs text-gray-500 mt-1">Enter 10-digit mobile number</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">Avatar generated from your name</div>
              <button
                type="submit"
                className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition"
              >
                Save Changes
              </button>
            </div>

            {message ? (
              <div className="text-sm text-emerald-600">{message}</div>
            ) : null}
          </form>
        </div>
      </main>
    </div>
  );
};

export default SettingsPage;
