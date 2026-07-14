import { requireClient } from "@/lib/auth";
import { ApiError, created, handleError, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { whatsappReminderSchema } from "@/lib/validations";
import { buildReminderForPayments } from "@/lib/whatsapp";

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = whatsappReminderSchema.parse(await readBody(request));
    const monthlyPaymentIds = uniqueIds([body.monthlyPaymentId, ...(body.monthlyPaymentIds ?? [])]);
    const enrollmentPaymentIds = uniqueIds([body.enrollmentPaymentId, ...(body.enrollmentPaymentIds ?? [])]);

    const clientConfig = await prisma.client.findFirst({
      where: { id: clientId, deletedAt: null },
      select: {
        businessName: true,
        paymentMethods: true,
        paymentMethodItems: true,
        whatsappMessageTemplate: true
      }
    });
    const monthlyPayments = monthlyPaymentIds.length
      ? await prisma.monthlyPayment.findMany({
          where: { id: { in: monthlyPaymentIds }, clientId, deletedAt: null },
          include: { student: true }
        })
      : [];
    const enrollmentPayments = enrollmentPaymentIds.length
      ? await prisma.enrollmentPayment.findMany({
          where: { id: { in: enrollmentPaymentIds }, clientId, deletedAt: null },
          include: { student: true }
        })
      : [];

    if (!clientConfig) throw new ApiError(401, "Cliente no encontrado");
    if (monthlyPayments.length !== monthlyPaymentIds.length) throw new ApiError(404, "Mensualidad no encontrada");
    if (enrollmentPayments.length !== enrollmentPaymentIds.length) throw new ApiError(404, "Inscripcion no encontrada");

    const items = [
      ...monthlyPayments.map((payment) => ({ ...payment, kind: "MONTHLY_PAYMENT" as const })),
      ...enrollmentPayments.map((payment) => ({ ...payment, kind: "ENROLLMENT_PAYMENT" as const }))
    ].sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime());

    const primaryItem = items[0];
    if (!primaryItem) throw new ApiError(422, "Debes enviar al menos un cobro");
    if (items.some((item) => item.estudianteId !== primaryItem.estudianteId)) {
      throw new ApiError(422, "Los cobros deben pertenecer al mismo estudiante");
    }

    const reminderData = buildReminderForPayments(items, clientConfig);
    if (!reminderData.phone) throw new ApiError(422, "El estudiante no tiene telefono disponible para WhatsApp");

    const reminder = await prisma.reminder.create({
      data: {
        clientId,
        estudianteId: primaryItem.estudianteId,
        monthlyPaymentId: primaryItem.kind === "MONTHLY_PAYMENT" ? primaryItem.id : undefined,
        enrollmentPaymentId: primaryItem.kind === "ENROLLMENT_PAYMENT" ? primaryItem.id : undefined,
        phone: reminderData.phone,
        message: reminderData.message,
        whatsappUrl: reminderData.whatsappUrl,
        status: "ENVIADO",
        sentAt: new Date()
      }
    });

    return created({ ...reminder, whatsappUrl: reminderData.whatsappUrl, message: reminderData.message });
  } catch (error) {
    return handleError(error);
  }
}

function uniqueIds(ids: Array<string | undefined>) {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}
