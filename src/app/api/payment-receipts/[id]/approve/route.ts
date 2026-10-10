import { requireClient } from "@/lib/auth";
import { handleError, ok, readBody } from "@/lib/http";
import { approveReceipt } from "@/lib/receipts";
import { receiptApproveSchema } from "@/lib/validations";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Params) {
  try {
    const { id } = await context.params;
    const { clientId } = await requireClient(request);
    const body = receiptApproveSchema.parse(await readBody(request));
    return ok(await approveReceipt(clientId, id, body));
  } catch (error) {
    return handleError(error);
  }
}
