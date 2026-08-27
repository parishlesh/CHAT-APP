import jwt from "jsonwebtoken";

const generateToken = (userId, res) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
  const production = process.env.NODE_ENV === "production";
  res.cookie("jwt", token, {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    path: "/",
  });
  return token;
};

export default generateToken;
