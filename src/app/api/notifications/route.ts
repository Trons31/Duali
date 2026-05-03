import { requireClient } from "@/lib/auth";
import { ApiError, handleError, ok, readBody } from "@/lib/http";
import {
  acknowledgeDeliveredNotifications,
  getNotificationsForClient,
  markNotificationsRead
} from "@/lib/notification-queue";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const { searchParams } = new URL(request.url);
    const afterSequence = Number(searchParams.get("afterSequence") ?? "0");
    const limit = Number(searchParams.get("limit") ?? "100");
    const notifications = await getNotificationsForClient(
      clientId,
      Number.isFinite(afterSequence) ? afterSequence : 0,
      Number.isFinite(limit) ? limit : 100
    );

    return ok({
      notifications,
      count: notifications.length,
      lastSequence: notifications.at(-1)?.sequence ?? afterSequence
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = await readBody<Record<string, unknown>>(request);
    const action = body.action;

    if (action === "ack-delivered") {
      const result = await acknowledgeDeliveredNotifications(clientId, {
        notificationIds: Array.isArray(body.notificationIds) ? body.notificationIds.filter((id): id is string => typeof id === "string") : undefined,
        uptoSequence: typeof body.uptoSequence === "number" ? body.uptoSequence : undefined
      });

      return ok(result);
    }

    if (action === "mark-read") {
      const result = await markNotificationsRead(clientId, {
        notificationIds: Array.isArray(body.notificationIds) ? body.notificationIds.filter((id): id is string => typeof id === "string") : undefined,
        uptoSequence: typeof body.uptoSequence === "number" ? body.uptoSequence : undefined
      });

      return ok(result);
    }

    throw new ApiError(400, "Accion no soportada");
  } catch (error) {
    return handleError(error);
  }
}
