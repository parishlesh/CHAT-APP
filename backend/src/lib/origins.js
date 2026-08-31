const normalizeOrigin = (value) => String(value || "").trim().replace(/\/+$/, "");

const hostnameOf = (value) => {
  try {
    return new URL(normalizeOrigin(value)).hostname;
  } catch {
    return "";
  }
};

export function getAllowedOrigins() {
  const extras = [process.env.CLIENT_URL, process.env.FRONTEND_URL]
    .filter(Boolean)
    .join(",")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
  return [...new Set(["http://localhost:5173", "http://127.0.0.1:5173", ...extras])];
}

export function isOriginAllowed(origin) {
  if (!origin) return process.env.NODE_ENV !== "production";
  const normalized = normalizeOrigin(origin);
  const allowed = getAllowedOrigins();
  if (allowed.includes(normalized)) return true;
  const host = hostnameOf(normalized);
  const allowsVercel = allowed.some((entry) => hostnameOf(entry).endsWith(".vercel.app"));
  if (allowsVercel && host.endsWith(".vercel.app")) return true;
  return process.env.NODE_ENV !== "production" && normalized.endsWith(".devtunnels.ms");
}

