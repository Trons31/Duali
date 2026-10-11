import { requireClient } from "@/lib/auth";
import { buildAccountingReport } from "@/lib/accounting-report";
import { handleError, ok } from "@/lib/http";

// Spec 028: Contabilidad del periodo (?filter=today|week|month|lastmonth|specificmonth|custom|day|paymentcycle).
export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const params = new URL(request.url).searchParams;
    const report = await buildAccountingReport(clientId, {
      filter: params.get("filter"),
      from: params.get("from"),
      to: params.get("to"),
      month: params.get("month"),
      day: params.get("day"),
      cycle: params.get("cycle")
    });
    return ok(report);
  } catch (error) {
    return handleError(error);
  }
}
