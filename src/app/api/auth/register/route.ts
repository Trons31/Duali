import { prisma } from "@/lib/prisma";
import { created, handleError, readBody, ApiError } from "@/lib/http";
import { hashPassword, sanitizeClient, signToken } from "@/lib/auth";
import { registerSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const body = registerSchema.parse(await readBody(request));
    const existing = await prisma.client.findUnique({ where: { email: body.email } });
    if (existing) throw new ApiError(409, "El email ya está registrado");

    const client = await prisma.client.create({
      data: {
        nombre: body.nombre,
        email: body.email,
        passwordHash: await hashPassword(body.password),
        telefono: body.telefono,
        businessName: body.businessName
      }
    });

    return created({ token: signToken(client), client: sanitizeClient(client) });
  } catch (error) {
    return handleError(error);
  }
}
