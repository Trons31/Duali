import { requireClient } from "@/lib/auth";
import { handleError, ok } from "@/lib/http";
import { listReceipts } from "@/lib/receipts";

// Spec 014 R3: comprobantes del negocio (?estado=POR_REVISAR, ?memberId=).
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const url = new URL(request.url);
    const estado = url.searchParams.get("estado");
    const valid = estado === "POR_REVISAR" || estado === "APROBADO" || estado === "RECHAZADO" ? estado : undefined;
    return ok(await listReceipts(clientId, valid, url.searchParams.get("memberId") ?? undefined));
  } catch (error) {
    return handleError(error);
  }
}
