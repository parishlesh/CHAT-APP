import jwt from "jsonwebtoken";
import User from "../models/user-model.js";
import { AppError, asyncHandler } from "../lib/errors.js";

const protectRoute = asyncHandler(async (req, res, next) => {
  const token = req.cookies.jwt;
  if (!token) throw new AppError(401, "Unauthorized.");

  let decode;
  try {
    decode = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new AppError(401, "Unauthorized.");
  }
  if (!decode?.userId) throw new AppError(401, "Unauthorized.");

  const user = await User.findById(decode.userId).select("-password");
  if (!user) throw new AppError(401, "Unauthorized.");
  const tokenVersion = Number(user.tokenVersion || 0);
  const claimed = Number(decode.tv || 0);
  if (claimed !== tokenVersion) throw new AppError(401, "Unauthorized.");
  req.user = user;
  next();
});

export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.jwt;
  if (!token || !process.env.JWT_SECRET) return next();
  try {
    const decode = jwt.verify(token, process.env.JWT_SECRET);
    if (!decode?.userId) return next();
    const user = await User.findById(decode.userId).select("-password");
    if (!user) return next();
    if (Number(decode.tv || 0) !== Number(user.tokenVersion || 0)) return next();
    req.user = user;
  } catch {
    /* unauthenticated request */
  }
  next();
});

export default protectRoute;
