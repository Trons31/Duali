// Spec 026: cuándo y cómo se ofrece activar las notificaciones del panel.

export const NOTIFICATIONS_PROMPT_SEEN_KEY = "duali:notifications-prompt-seen-v1";

export type BrowserPermission = NotificationPermission | "unsupported";

/**
 * - `ask`: se puede pedir el permiso desde el botón "Activar".
 * - `ios-install`: iPhone/iPad fuera de la app instalada; Safari no entrega push ahí.
 * - `blocked`: el navegador ya lo bloqueó; solo se reabre desde sus ajustes.
 * - `hidden`: no hay nada que ofrecer (concedido o sin soporte).
 */
export type PromptMode = "ask" | "ios-install" | "blocked" | "hidden";

export function notificationPromptMode(input: {
  permission: BrowserPermission;
  isIOS: boolean;
  isStandalone: boolean;
}): PromptMode {
  // En iOS fuera de la pantalla de inicio ni siquiera existe `Notification`.
  if (input.isIOS && !input.isStandalone) return "ios-install";
  if (input.permission === "unsupported" || input.permission === "granted") return "hidden";
  if (input.permission === "denied") return "blocked";
  return "ask";
}

/** Solo se abre sin que lo pidan cuando hay algo que activar y no se preguntó antes. */
export function shouldAutoOpenNotificationPrompt(mode: PromptMode, alreadyAsked: boolean) {
  if (alreadyAsked) return false;
  return mode === "ask" || mode === "ios-install";
}

/** Evento de ventana con el que otra pantalla reabre la invitación (R6). */
export const OPEN_NOTIFICATIONS_PROMPT_EVENT = "duali:open-notifications-prompt";
