import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      index: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    profilePic: {
      type: String,
      default: "",
    },

    about: {
      type: String,
      default: "",
    },

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    // Browser-generated ECDH P-256 public JWK. Private material never reaches this API.
    encryptionPublicKey: { type: mongoose.Schema.Types.Mixed, default: null },

    mood: {
      type: String,
      enum: ["happy", "angry", "calm", "sad", "professional", "excited", "sleepy", "romantic"],
    },
    moodUpdatedAt: Date,
  },
  {
    timestamps: true,
  }
);

userSchema.index({
  fullName: "text",
  username: "text",
  email: "text",
});

const User = mongoose.model("User", userSchema);

export default User;
