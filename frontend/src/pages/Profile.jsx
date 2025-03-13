import React, { useState } from 'react'
import { useAuth } from '../store/useAuth'
import { Camera } from 'lucide-react'

const Profile = () => {

  const {authUser, isUpdatingProfile, updateProfile} = useAuth()
  const [selectedImg, setSelectedImg]= useState(null)

  

  // const handleImageUpload = async(e)=>{
  //   const file = e.target.files[0]
  //   if(!file){
  //     return
  //   }
  //   const reader = new FileReader()

  //   reader.readAsDataURL(file)

  //   reader.onload = async ()=>{
  //     const base64Image = reader.result
  //     setSelectedImg(base64Image)
  //     await updateProfile({
  //       profilePic: base64Image 
  //     })
  //   }
  // }

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

          resolve(canvas.toDataURL("image/jpeg", 0.7)); // ✅ Reduce quality to 70%
        };
      };
    });
  };

  // ✅ Handle Image Upload & Resize
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const resizedImage = await resizeImage(file, 300, 300); // ✅ Resize before upload
    setSelectedImg(resizedImage);
    await updateProfile({ profilePic: resizedImage });
  };


  return (
   <>
     <div className="flex items-center justify-center h-screen">
    <div className="text-center">
      <img
        src={selectedImg || authUser.profilePic || "/avatar.png"}
        alt="profile pic"
        className="w-44 h-44 rounded-full mx-auto"
      />
      <label
        htmlFor="avatar-upload"
        className={`xyz ${isUpdatingProfile ? "animate-pulse pointer-events-none" : ""}`}
      >
        <Camera className='w-5 h-5 text-base-200 text-black cursor-pointer'/>
        <input type='file'
        id ="avatar-upload"
        className='hidden'
        accept='image/*'
        onChange={handleImageUpload}
        disabled={isUpdatingProfile} />
      </label>
    </div>
  </div>
   </>
  )
}

export default Profile
