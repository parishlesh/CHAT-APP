import jwt from "jsonwebtoken";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const authCookieOptions = ({ clearing = false } = {}) => {
  const production = process.env.NODE_ENV === "production";
  const crossSite = String(process.env.COOKIE_SAMESITE || "").toLowerCase() === "none";
  const sameSite = production && crossSite ? "none" : "lax";
  const secure = production || sameSite === "none";
  const options = {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: clearing ? 0 : WEEK_MS,
  };
  if (sameSite === "none") options.partitioned = true;
  return options;
};

export const tokenVersionOf = (userOrVersion) => {
  if (userOrVersion && typeof userOrVersion === "object") return Number(userOrVersion.tokenVersion || 0);
  return Number(userOrVersion || 0);
};

const generateToken = (userId, res, tokenVersion = 0) => {
  const token = jwt.sign(
    { userId, tv: tokenVersionOf(tokenVersion) },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.cookie("jwt", token, authCookieOptions());
  return token;
};

export const toSelfUser = (user) => {
  const value = user?.toObject ? user.toObject() : user;
  if (!value) return value;
  return {
    _id: value._id,
    fullName: value.fullName,
    username: value.username,
    email: value.email,
    phone: value.phone,
    about: value.about,
    profilePic: value.profilePic,
    mood: value.mood,
    moodUpdatedAt: value.moodUpdatedAt,
    availability: value.availability,
    encryptionPublicKey: value.encryptionPublicKey || null,
    encryptionKeyBackup: value.encryptionKeyBackup != null ? value.encryptionKeyBackup : null,
  };
};

export default generateToken;
