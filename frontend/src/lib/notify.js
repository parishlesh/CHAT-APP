const notified = new Set();

export function notifyIncomingMessage({ title, body, tag }) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;
  if (tag && notified.has(tag)) return;
  if (tag) {
    notified.add(tag);
    setTimeout(() => notified.delete(tag), 60_000);
  }
  try {
    new Notification(title, { body, tag });
  } catch {
    /* browsers may block without a service worker */
  }
}

export async function requestNotificationPermission() {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}
