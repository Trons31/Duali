import { requireClient } from "@/lib/auth";
import { getDashboardPendingPayments } from "@/lib/dashboard-data";
import { handleError, ok } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    return ok(await getDashboardPendingPayments(clientId));
  } catch (error) {
    return handleError(error);
  }
}
