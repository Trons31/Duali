import { prisma } from "@/lib/prisma";
import { handleError, ok, readBody, ApiError } from "@/lib/http";
import { authClientSelect, comparePassword, sanitizeClient, signToken } from "@/lib/auth";
import { loginSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await readBody(request));
    const client = await prisma.client.findFirst({
      where: { email: body.email, deletedAt: null },
      select: authClientSelect
    });
    if (!client) throw new ApiError(401, "Credenciales inválidas");

    const isValid = await comparePassword(body.password, client.passwordHash);
    if (!isValid) throw new ApiError(401, "Credenciales inválidas");

    return ok({ token: signToken(client), client: sanitizeClient(client) });
  } catch (error) {
    return handleError(error);
  }

  
}
