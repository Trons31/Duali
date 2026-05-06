import { requireClient, sanitizeClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { ensureClientSubscription, serializeSubscription } from "@/lib/subscriptions";

export async function GET(request: Request) {
  try {
    const { client } = await requireClient(request);
    const subscription = await ensureClientSubscription(client.id);

    return ok({
      client: sanitizeClient(client),
      subscription: serializeSubscription(subscription)
    });
  } catch (error) {
    return handleError(error);
  }
}
