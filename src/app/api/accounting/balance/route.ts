import { requireClient } from "@/lib/auth";
import { getAccountingSummary } from "@/lib/accounting";
import { handleError, ok } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const summary = await getAccountingSummary(clientId);
    return ok({ ingresosTotales: summary.ingresosTotales, gastosTotales: summary.gastosTotales, balance: summary.balance });
  } catch (error) {
    return handleError(error);
  }
}
