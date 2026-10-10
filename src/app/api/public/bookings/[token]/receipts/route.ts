import { created, handleError, readBody } from "@/lib/http";
import { attachReceipt } from "@/lib/receipts";
import { mediaInputSchema } from "@/lib/validations";

type Params = { params: Promise<{ token: string }> };

// Spec 014 R2: adjunta el comprobante ya subido a Cloudinary.
export async function POST(request: Request, context: Params) {
  try {
    const { token } = await context.params;
    const media = mediaInputSchema.parse(await readBody(request));
    return created(await attachReceipt(token, media));
  } catch (error) {
    return handleError(error);
  }
}
