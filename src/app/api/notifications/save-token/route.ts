import { requireClient } from "@/lib/auth";
import { created, handleError, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { savePushTokenSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = savePushTokenSchema.parse(await readBody(request));

    const token = await prisma.pushToken.upsert({
      where: { token: body.token },
      update: { clientId, platform: body.platform, deviceName: body.deviceName, isActive: true, lastUsedAt: new Date() },
      create: { clientId, token: body.token, platform: body.platform, deviceName: body.deviceName }
    });

    return created(token);
  } catch (error) {
    return handleError(error);
  }
}
