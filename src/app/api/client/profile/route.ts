import { requireClient, sanitizeClient } from "@/lib/auth";
import { handleError, ok, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { clientProfileSchema } from "@/lib/validations";

export async function GET(request: Request) {
  try {
    const { safeClient } = await requireClient(request);
    return ok(safeClient);
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = clientProfileSchema.parse(await readBody(request));
    const client = await prisma.client.update({ where: { id: clientId }, data: body });
    return ok(sanitizeClient(client));
  } catch (error) {
    return handleError(error);
  }
}
