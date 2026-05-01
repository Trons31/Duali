import { queueAndSendAdminPaymentReminders } from "@/lib/admin-reminders";
import { handleError, ok } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const result = await queueAndSendAdminPaymentReminders();
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}

export const POST = GET;
