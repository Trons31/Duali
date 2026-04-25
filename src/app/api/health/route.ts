import { ok } from "@/lib/http";

export async function GET() {
  return ok({ status: "healthy", timestamp: new Date().toISOString() });
}
