import React, { useState } from 'react'
import { useAuth } from '../store/useAuth'
import { Camera, User, Info, Phone, Pencil } from "lucide-react";

const Profile = () => {

  const { authUser, isUpdatingProfile, updateProfile } = useAuth()
  const [selectedImg, setSelectedImg] = useState(null)
  const [editing, setEditing] = useState(false)
  const [about, setAbout] = useState(authUser.about || "")

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


  const handleEdit = () => {
    setEditing((prev) => !prev);
  };

  return (
    <>
      <div className="py-8 space-y-6 flex flex-col items-center justify-center w-full  bg-base-100 ">
        <div className="relative  inline-flex flex-col w-64  mx-auto">
          <img
            src={selectedImg || authUser.profilePic || "/avatar.png"}
            alt="Profile"
            className="w-64 h-64 rounded-full object-cover border-4 border-white shadow-md"
          />
          <div>
            <label
              htmlFor="avatar-upload"
              className={`absolute bottom-28 right-2 bg-white p-2 rounded-full shadow-md cursor-pointer ${isUpdatingProfile ? "animate-pulse pointer-events-none opacity-50" : ""
                }`}
            >
              <Camera className=" w-8 h-8" />
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

          <div className="flex flex-col items-center mt-4 text-center">
            <div className="font-semibold text-2xl py-2">{authUser.fullName}</div>
            <div className="text-lg py-2">{authUser.email}</div>
          </div>
        </div>
      </div>

      <div className="m-6">
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
          onChange={(e) => setAbout(e.target.value)}
          placeholder={authUser.about || "No bio available."}
          className="textarea textarea-bordered w-full resize-none"

          >

          
          </textarea>
        </div>
      </div>
    </>
  );
}

export default Profile
