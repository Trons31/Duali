import { Expo, ExpoPushMessage } from "expo-server-sdk";

const expo = new Expo();

export async function sendExpoPushNotifications(tokens: string[], title: string, body: string, data?: Record<string, unknown>) {
  const messages: ExpoPushMessage[] = [];

  for (const token of tokens) {
    if (!Expo.isExpoPushToken(token)) continue;
    messages.push({ to: token, sound: "default", title, body, data });
  }

  if (tokens.length > 0 && messages.length === 0) {
    throw new Error("No hay Expo Push Tokens validos");
  }

  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];

  for (const chunk of chunks) {
    const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
    tickets.push(...ticketChunk);
  }

  return tickets;
}

export function hasPushFailures(tickets: Awaited<ReturnType<typeof sendExpoPushNotifications>>) {
  return tickets.some((ticket) => ticket.status === "error");
}
