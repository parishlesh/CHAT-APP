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
  req.user = user;
  next();
});

export default protectRoute;
