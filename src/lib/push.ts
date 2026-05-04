import { Expo, ExpoPushMessage } from "expo-server-sdk";

const expo = new Expo();

export type PushTicketResult = {
  token: string;
  ticket: Awaited<ReturnType<typeof expo.sendPushNotificationsAsync>>[number];
};

export async function sendExpoPushNotifications(tokens: string[], title: string, body: string, data?: Record<string, unknown>) {
  const messages: ExpoPushMessage[] = [];
  const validTokens: string[] = [];

  for (const token of tokens) {
    if (!Expo.isExpoPushToken(token)) continue;
    messages.push({ to: token, sound: "default", title, body, data });
    validTokens.push(token);
  }

  if (tokens.length > 0 && messages.length === 0) {
    throw new Error("No hay Expo Push Tokens validos");
  }

  const chunks = expo.chunkPushNotifications(messages);
  const ticketResults: PushTicketResult[] = [];
  let cursor = 0;

  for (const chunk of chunks) {
    const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
    for (let index = 0; index < ticketChunk.length; index += 1) {
      ticketResults.push({
        token: validTokens[cursor + index],
        ticket: ticketChunk[index]
      });
    }
    cursor += ticketChunk.length;
  }

  return ticketResults;
}

export function hasPushFailures(tickets: Awaited<ReturnType<typeof sendExpoPushNotifications>>) {
  return tickets.some(({ ticket }) => ticket.status === "error");
}

export function getPushFailureDetails(tickets: Awaited<ReturnType<typeof sendExpoPushNotifications>>) {
  return tickets
    .filter(({ ticket }) => ticket.status === "error")
    .map(({ token, ticket }) => {
      const errorTicket = ticket as Extract<typeof ticket, { status: "error" }>;
      const details =
        errorTicket.details && typeof errorTicket.details === "object"
          ? JSON.stringify(errorTicket.details)
          : undefined;

      return {
        token,
        message: [errorTicket.message, details].filter(Boolean).join(" | ") || "Expo devolvio un error desconocido"
      };
    });
}
