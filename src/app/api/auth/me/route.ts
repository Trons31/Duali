import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const { safeClient } = await requireClient(request);
    return ok(safeClient);
  } catch (error) {
    return handleError(error);
  }
}
