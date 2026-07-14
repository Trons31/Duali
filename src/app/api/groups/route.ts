import { requireClient } from "@/lib/auth";
import { getDashboardGroupSummaries } from "@/lib/dashboard-data";
import { created, handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { groupSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    return ok(await getDashboardGroupSummaries(clientId));
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = groupSchema.parse(await readBody(request));
    const group = await prisma.group.create({ data: { ...body, clientId } });
    return created(group);
  } catch (error) {
    return handleError(error);
  }
}
