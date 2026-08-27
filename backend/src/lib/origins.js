export function getAllowedOrigins() {
  const extras = (process.env.CLIENT_URL || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(["http://localhost:5173", "http://127.0.0.1:5173", ...extras])];
}

export function isOriginAllowed(origin) {
  if (!origin) return process.env.NODE_ENV !== "production";
  if (getAllowedOrigins().includes(origin)) return true;
  return process.env.NODE_ENV !== "production" && origin.endsWith(".devtunnels.ms");
}
