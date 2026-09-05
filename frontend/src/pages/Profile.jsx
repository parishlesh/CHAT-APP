import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../store/useAuth'
import { ArrowLeft, Camera, Info, Pencil } from "lucide-react";

const Profile = () => {

  const { authUser, isUpdatingProfile, updateProfile } = useAuth()
  const [selectedImg, setSelectedImg] = useState(null)
  const [editing, setEditing] = useState(false)
  const [about, setAbout] = useState(authUser.about || "")
  const [username, setUsername] = useState(authUser.username || "")
  const [phone, setPhone] = useState(authUser.phone || "")

  const resizeImage = (file, maxWidth, maxHeight) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
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
    if (!file) return;

    const resizedImage = await resizeImage(file, 300, 300);
    setSelectedImg(resizedImage);
    await updateProfile({ profilePic: resizedImage });
  };


  const handleEdit = async () => {
    if (editing) {
      await updateProfile({ about, username, phone });
    }
    setEditing((prev) => !prev);
  };

  return (
    <div className="h-full overflow-y-auto overscroll-contain safe-bottom">
      <div className="px-4 pt-4 md:hidden">
        <Link to="/" className="btn btn-ghost btn-sm w-fit" aria-label="Back to messages">
          <ArrowLeft size={16} /> Messages
        </Link>
      </div>
      <div className="flex w-full flex-col items-center justify-center space-y-6 bg-base-100 px-4 py-6 sm:py-8">
        <div className="relative mx-auto inline-flex w-full max-w-[16rem] flex-col items-center">
          <div className="relative">
            <img
              src={selectedImg || authUser.profilePic || "/avatar.svg"}
              alt="Profile"
              className="h-32 w-32 rounded-full border-4 border-white object-cover shadow-md sm:h-48 sm:w-48 md:h-64 md:w-64"
            />
            <label
              htmlFor="avatar-upload"
              className={`absolute bottom-1 right-1 cursor-pointer rounded-full bg-white p-2 shadow-md sm:bottom-2 sm:right-2 ${isUpdatingProfile ? "pointer-events-none animate-pulse opacity-50" : ""}`}
            >
              <Camera className="h-5 w-5 sm:h-8 sm:w-8" />
              <input
                type="file"
                id="avatar-upload"
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={isUpdatingProfile}
              />
            </label>
          </div>

          <div className="mt-4 flex w-full min-w-0 flex-col items-center text-center">
            <div className="max-w-full truncate py-1 text-xl font-semibold sm:text-2xl">{authUser.fullName}</div>
            <div className="max-w-full break-all py-1 text-sm sm:text-lg">{authUser.email}</div>
          </div>
        </div>
      </div>

      <div className="mx-4 mb-8 sm:m-6">
        <div className="mt-6 w-full">
          <label className="text-lg">Username</label>
          <input disabled={!editing} value={username} onChange={(e) => setUsername(e.target.value)} className="input input-bordered mt-2 w-full text-base" />
        </div>
        <div className="mt-6 w-full flex items-center justify-between gap-2 ">
          <div className="flex items-center gap-2">

          <Info className=" w-5 h-5" />
          <h2 className="text-lg ">Your Bio</h2>
          </div>
          <button onClick={handleEdit}>

          <Pencil  className=" w-5 h-5" />
          </button>
        </div>

        <div className="mt-6 w-full flex items-center gap-2 ">
          <textarea 
          disabled={!editing}
          name="about" 
          id="about"
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          placeholder="No bio available."
          className="textarea textarea-bordered w-full resize-none text-base"
          />
        </div>
        <div className="mt-6 w-full">
          <label className="text-lg">Phone number</label>
          <input disabled={!editing} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="No phone number" className="input input-bordered mt-2 w-full text-base" />
        </div>
      </div>
    </div>
  );
}

export default Profile
