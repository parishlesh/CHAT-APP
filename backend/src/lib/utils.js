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

const generateToken = (userId, res) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.cookie("jwt", token, authCookieOptions());
  return token;
};

export default generateToken;
