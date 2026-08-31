import cloudinary from "../lib/cloudinary.js";
import generateToken, { authCookieOptions, toSelfUser } from "../lib/utils.js";
import User from "../models/user-model.js";
import bcrypt from "bcryptjs";

const publicKeyFingerprint = (jwk) => {
    if (!jwk?.x || !jwk?.y) return "";
    const normalize = (value) => String(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return `${normalize(jwk.x)}.${normalize(jwk.y)}`;
};

const sanitizePublicKey = (jwk) => {
    if (!jwk || typeof jwk !== "object" || jwk.d || jwk.privateKey) return null;
    if (jwk.kty !== "EC" || !jwk.crv || typeof jwk.x !== "string" || typeof jwk.y !== "string") return null;
    return { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
};

const sanitizeKeyBackup = (backup) => {
    if (!backup || typeof backup !== "object" || backup.d || backup.privateKey) return null;
    const { v, salt, iv, ciphertext } = backup;
    if (v !== 1 || typeof salt !== "string" || typeof iv !== "string" || typeof ciphertext !== "string") return null;
    if (!salt || !iv || !ciphertext) return null;
    return { v: 1, salt, iv, ciphertext };
};

export const signup = async (req, res) => {
    try {
        const {
            fullName,
            username,
            email,
            password,
            phone = "",
            about = "",
            profilePic = "",
        } = req.body;

        if (!fullName || !username || !email || !password) {
            return res.status(400).json({
                message: "Full name, username, email and password are required",
            });
        }

        if (password.length < 6) {
            return res
                .status(400)
                .json({ message: "Password must be at least 6 characters." });
        }

        const normalizedUsername = username.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
            return res.status(400).json({
                message: "Username must be 3 to 30 characters and use only letters, numbers, or underscores.",
            });
        }

        const existingEmail = await User.findOne({
            email: email.toLowerCase(),
        });

        if (existingEmail) {
            return res.status(400).json({
                message: "Email already exists",
            });
        }

        const existingUsername = await User.findOne({
            username: normalizedUsername,
        });

        if (existingUsername) {
            return res.status(400).json({
                message: "Username already taken",
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            fullName,
            username: normalizedUsername,
            email: email.toLowerCase(),
            password: hashedPassword,
            phone,
            about,
            profilePic,
        });

        generateToken(user._id, res);

        res.status(201).json(toSelfUser(user));
    } catch (error) {
        console.log("Signup failed");
        if (error.code === 11000) {
            return res.status(400).json({ message: "Email or username already exists" });
        }
        res.status(500).json({
            message: "Internal Server Error",
        });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const identity = (email || "").trim().toLowerCase();

        if (!identity || !password) {
            return res.status(400).json({ message: "Email or username and password are required" });
        }

        const user = await User.findOne({
            $or: [
                { email: identity },
                { username: identity },
            ],
        });

        if (!user) {
            return res.status(400).json({
                message: "Invalid credentials",
            });
        }

        const correctPassword = await bcrypt.compare(
            password,
            user.password
        );

        if (!correctPassword) {
            return res.status(400).json({
                message: "Invalid credentials",
            });
        }

        generateToken(user._id, res);

        res.status(200).json(toSelfUser(user));
    } catch (error) {
        console.log("Login failed");

        res.status(500).json({
            message: "Internal Server Error",
        });
    }
};

export const logout = (req, res) => {
    try {
        res.cookie("jwt", "", authCookieOptions({ clearing: true }));

        res.status(200).json({
            message: "Logged out successfully",
        });
    } catch (error) {
        res.status(500).json({
            message: "Internal Server Error",
        });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const userId = req.user._id;

        const {
            profilePic,
            about,
            phone,
            fullName,
            username,
        } = req.body;

        const updateFields = {};

        if (profilePic) {
            const upload = await cloudinary.uploader.upload(profilePic);

            updateFields.profilePic = upload.secure_url;
        }

        if (about !== undefined) {
            updateFields.about = about;
        }

        if (phone !== undefined) {
            updateFields.phone = phone;
        }

        if (fullName !== undefined) {
            updateFields.fullName = fullName;
        }

        if (username !== undefined) {
            const normalizedUsername = username.trim().toLowerCase();
            if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
                return res.status(400).json({ message: "Username must be 3 to 30 characters and use only letters, numbers, or underscores." });
            }
            const exists = await User.findOne({
                username: normalizedUsername,
                _id: { $ne: userId },
            });

            if (exists) {
                return res.status(400).json({
                    message: "Username already taken",
                });
            }

            updateFields.username = normalizedUsername;
        }

        const user = await User.findByIdAndUpdate(
            userId,
            updateFields,
            {
                new: true,
            }
        ).select("-password");

        res.status(200).json(toSelfUser(user));
    } catch (error) {
        console.log(error);
        if (error.code === 11000) return res.status(400).json({ message: "Username already taken" });
        res.status(500).json({
            message: "Internal Server Error",
        });
    }
};

export const checkUsername = async (req, res) => {
    try {
        const username = req.params.username.toLowerCase();

        const exists = await User.exists({
            username,
        });

        res.json({
            available: !exists,
        });
    } catch (error) {
        res.status(500).json({
            message: "Internal Server Error",
        });
    }
};

export const checkAuth = (req, res) => {
    res.status(200).json(toSelfUser(req.user));
};

export const updateEncryptionKey = async (req, res) => {
    try {
        const incomingPublic = sanitizePublicKey(req.body.encryptionPublicKey);
        const incomingBackup = sanitizeKeyBackup(req.body.encryptionKeyBackup);
        if (!incomingPublic && !incomingBackup) {
            return res.status(400).json({ message: "A valid public key is required." });
        }

        const user = await User.findById(req.user._id).select("-password");
        if (!user) return res.status(401).json({ message: "Unauthorized." });

        const existingFp = publicKeyFingerprint(user.encryptionPublicKey);
        const incomingFp = publicKeyFingerprint(incomingPublic);
        if (existingFp && incomingFp && existingFp !== incomingFp) {
            return res.status(409).json({
                message: "Encryption identity already exists.",
                ...toSelfUser(user),
            });
        }

        const update = {};
        if (!existingFp && incomingPublic) update.encryptionPublicKey = incomingPublic;
        if (incomingBackup) update.encryptionKeyBackup = incomingBackup;
        if (!Object.keys(update).length) {
            return res.status(200).json(toSelfUser(user));
        }

        const saved = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select("-password");
        res.status(200).json(toSelfUser(saved));
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error" });
    }
};
