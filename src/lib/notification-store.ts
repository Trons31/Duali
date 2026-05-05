const CURSOR_KEY = "duali:last-notification-sequence";

export async function getNotificationCursor() {
  if (typeof window === "undefined") return 0;
  return Number(window.localStorage.getItem(CURSOR_KEY) ?? "0") || 0;
}

export async function setNotificationCursor(sequence: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CURSOR_KEY, String(sequence));
}
