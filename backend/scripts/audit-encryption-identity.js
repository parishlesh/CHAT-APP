import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../src/models/user-model.js";

dotenv.config();

const usableBackup = (backup) => {
  if (!backup || typeof backup !== "object") return null;
  const v = Number(backup.v);
  const { salt, iv, ciphertext } = backup;
  if (v !== 1 || typeof salt !== "string" || typeof iv !== "string" || typeof ciphertext !== "string") return null;
  if (!salt || !iv || !ciphertext) return null;
  return { v: 1, ciphertextLength: ciphertext.length };
};

const hasPublic = (jwk) => Boolean(jwk && typeof jwk === "object" && jwk.x && jwk.y);

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.find({}).select("username encryptionPublicKey encryptionKeyBackup");
  const rows = users.map((user) => {
    const backup = usableBackup(user.encryptionKeyBackup);
    return {
      username: user.username,
      hasPublicKey: hasPublic(user.encryptionPublicKey),
      hasWrappedBackup: Boolean(backup),
      backupLength: backup?.ciphertextLength || 0,
      publicKeyShape: user.encryptionPublicKey && typeof user.encryptionPublicKey === "object"
        ? Object.keys(user.encryptionPublicKey).sort().join(",")
        : typeof user.encryptionPublicKey,
      backupShape: user.encryptionKeyBackup && typeof user.encryptionKeyBackup === "object"
        ? Object.keys(user.encryptionKeyBackup).sort().join(",")
        : user.encryptionKeyBackup == null ? "null" : typeof user.encryptionKeyBackup,
    };
  });
  console.log(JSON.stringify({
    userCount: rows.length,
    withPublicKey: rows.filter((row) => row.hasPublicKey).length,
    withWrappedBackup: rows.filter((row) => row.hasWrappedBackup).length,
    withPublicButNoBackup: rows.filter((row) => row.hasPublicKey && !row.hasWrappedBackup).length,
    rows,
  }, null, 2));
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error("AUDIT_FAILED", error.message);
  process.exit(1);
});
