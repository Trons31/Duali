import { requireClient } from "@/lib/auth";
import { ApiError, created, handleError, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { whatsappReminderSchema } from "@/lib/validations";
import { buildReminderForEnrollment, buildReminderForPayment } from "@/lib/whatsapp";

export async function POST(request: Request) {
  try {
    const { clientId } = await requireClient(request);
    const body = whatsappReminderSchema.parse(await readBody(request));
    if (body.enrollmentPaymentId) {
      const payment = await prisma.enrollmentPayment.findFirst({
        where: { id: body.enrollmentPaymentId, clientId, deletedAt: null },
        include: { student: true }
      });

      if (!payment) throw new ApiError(404, "Inscripción no encontrada");

      const reminderData = buildReminderForEnrollment(payment);
      if (!reminderData.phone) throw new ApiError(422, "El estudiante no tiene teléfono disponible para WhatsApp");

      const reminder = await prisma.reminder.create({
        data: {
          clientId,
          estudianteId: payment.estudianteId,
          enrollmentPaymentId: payment.id,
          phone: reminderData.phone,
          message: reminderData.message,
          whatsappUrl: reminderData.whatsappUrl,
          status: "ENVIADO",
          sentAt: new Date()
        }
      });

      return created({ ...reminder, whatsappUrl: reminderData.whatsappUrl, message: reminderData.message });
    }

    const payment = await prisma.monthlyPayment.findFirst({
      where: { id: body.monthlyPaymentId as string, clientId, deletedAt: null },
      include: { student: true }
    });

    if (!payment) throw new ApiError(404, "Mensualidad no encontrada");

    const reminderData = buildReminderForPayment(payment);
    if (!reminderData.phone) throw new ApiError(422, "El estudiante no tiene teléfono disponible para WhatsApp");

    const reminder = await prisma.reminder.create({
      data: {
        clientId,
        estudianteId: payment.estudianteId,
        monthlyPaymentId: payment.id,
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
