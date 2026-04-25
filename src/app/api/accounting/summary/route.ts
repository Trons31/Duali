import { requireClient } from "@/lib/auth";
import { getAccountingSummary } from "@/lib/accounting";
import { handleError, ok } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    return ok(await getAccountingSummary(clientId));
  } catch (error) {
    return handleError(error);
  }
}
