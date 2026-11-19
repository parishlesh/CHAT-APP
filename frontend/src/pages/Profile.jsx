import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../store/useAuth'
import toast from 'react-hot-toast'
import { ArrowLeft, AtSign, Camera, Loader2, Mail, Pencil, Phone } from "lucide-react";

const Profile = () => {

  const { authUser, isUpdatingProfile, updateProfile } = useAuth()
  const [selectedImg, setSelectedImg] = useState(null)
  const [editing, setEditing] = useState(false)
  const [about, setAbout] = useState(authUser.about || "")
  const [username, setUsername] = useState(authUser.username || "")
  const [phone, setPhone] = useState(authUser.phone || "")

  const resizeImage = (file, maxWidth, maxHeight) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read this image."));
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.onerror = () => reject(new Error("This image format isn't supported by your browser."));
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            const scale = Math.min(maxWidth / width, maxHeight / height);
            width *= scale;
            height *= scale;
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
      };
    });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    let resizedImage;
    try {
      resizedImage = await resizeImage(file, 300, 300);
    } catch (error) {
      toast.error(error.message);
      return;
    }
    setSelectedImg(resizedImage);
    await updateProfile({ profilePic: resizedImage });
  };


  const startEditing = () => {
    setAbout(authUser.about || "");
    setUsername(authUser.username || "");
    setPhone(authUser.phone || "");
    setEditing(true);
  };

  const cancelEditing = () => {
    setAbout(authUser.about || "");
    setUsername(authUser.username || "");
    setPhone(authUser.phone || "");
    setEditing(false);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    await updateProfile({ about: about.trim(), username: username.trim().toLowerCase(), phone: phone.trim() });
    setEditing(false);
  };

  const fieldClass = "input input-bordered w-full text-base disabled:cursor-default disabled:border-base-300 disabled:bg-base-200/60 disabled:text-base-content";
  const memberSince = authUser.createdAt ? new Date(authUser.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : null;

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-base-200/40 safe-bottom">
      <div className="mx-auto w-full max-w-2xl px-4 py-4 sm:py-8">
        <Link to="/" className="btn btn-ghost btn-sm mb-3 gap-1 normal-case md:hidden" aria-label="Back to messages">
          <ArrowLeft size={16} /> Messages
        </Link>

        <section className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
          <div className="h-24 bg-gradient-to-r from-primary/80 via-secondary/70 to-accent/70 sm:h-28" aria-hidden="true" />
          <div className="-mt-12 flex flex-col items-center px-4 pb-6 text-center sm:-mt-14">
            <div className="relative">
              <img
                src={selectedImg || authUser.profilePic || "/avatar.svg"}
                alt="Your profile photo"
                className="h-24 w-24 rounded-full border-4 border-base-100 bg-base-200 object-cover shadow-md sm:h-28 sm:w-28"
              />
              <label
                htmlFor="avatar-upload"
                title="Change photo"
                className={`absolute bottom-0 right-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-content shadow-md ring-4 ring-base-100 ${isUpdatingProfile ? "pointer-events-none opacity-70" : "hover:scale-105"}`}
              >
                {isUpdatingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                <span className="sr-only">Change profile photo</span>
                <input type="file" id="avatar-upload" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUpdatingProfile} />
              </label>
            </div>
            <h1 className="mt-3 max-w-full truncate text-xl font-bold sm:text-2xl">{authUser.fullName}</h1>
            <p className="max-w-full truncate text-sm text-base-content/60">@{authUser.username}</p>
            {authUser.about && !editing && <p className="mt-2 max-w-md whitespace-pre-wrap text-sm text-base-content/80">{authUser.about}</p>}
          </div>
        </section>

        <form onSubmit={saveProfile} className="mt-4 rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Profile details</h2>
            {!editing && (
              <button type="button" className="btn btn-ghost btn-sm gap-1.5 normal-case" onClick={startEditing}>
                <Pencil size={14} /> Edit
              </button>
            )}
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><AtSign size={14} /> Username</span>
              <input disabled={!editing} value={username} onChange={(e) => setUsername(e.target.value)} className={fieldClass} autoComplete="username" maxLength={30} />
              {editing && <span className="mt-1 block text-xs text-base-content/50">3–30 letters, numbers or underscores.</span>}
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-sm font-medium">
                <span>Bio</span>
                {editing && <span className="text-xs font-normal text-base-content/50">{about.length}/300</span>}
              </span>
              <textarea
                disabled={!editing}
                value={about}
                onChange={(e) => setAbout(e.target.value.slice(0, 300))}
                placeholder={editing ? "A line about you" : "No bio yet"}
                rows={3}
                className="textarea textarea-bordered w-full resize-none text-base disabled:cursor-default disabled:border-base-300 disabled:bg-base-200/60 disabled:text-base-content"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><Phone size={14} /> Phone</span>
              <input disabled={!editing} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={editing ? "Optional" : "Not added"} className={fieldClass} type="tel" autoComplete="tel" />
            </label>

            <div className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><Mail size={14} /> Email</span>
              <p className="rounded-lg border border-base-300 bg-base-200/60 px-4 py-3 text-base text-base-content/80 [overflow-wrap:anywhere]">{authUser.email}</p>
            </div>
          </div>

          {editing && (
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm normal-case" onClick={cancelEditing} disabled={isUpdatingProfile}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm normal-case" disabled={isUpdatingProfile}>
                {isUpdatingProfile ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
          {memberSince && !editing && <p className="mt-6 text-center text-xs text-base-content/50">Member since {memberSince}</p>}
        </form>
      </div>
    </div>
  );
}

export default Profile
