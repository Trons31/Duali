import { requireClient } from "@/lib/auth";
import { handleError, ok, readBody } from "@/lib/http";
import { rejectReceipt } from "@/lib/receipts";
import { receiptRejectSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = receiptRejectSchema.parse(await readBody(request));
    return ok(await rejectReceipt(clientId, id, body.motivo));
  } catch (error) {
    return handleError(error);
  }
}
