import { z } from "zod";
import { validateOverduePaymentMessageTemplate } from "@/lib/whatsapp-template";

const localDateInputSchema = z.union([z.string(), z.date()]).transform((value, ctx) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fecha inválida" });
      return z.NEVER;
    }

    return value;
  }

  const trimmed = value.trim();
  const localDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  if (localDateMatch) {
    const [, year, month, day] = localDateMatch;
    return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fecha inválida" });
    return z.NEVER;
  }

  return parsed;
});

export const registerSchema = z.object({
  nombre: z.string().min(2),
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8),
  telefono: z.string().optional(),
  businessName: z.string().min(2)
});

export const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1)
});

export const clientProfileSchema = z.object({
  nombre: z.string().min(2).optional(),
  telefono: z.string().optional().nullable(),
  businessName: z.string().min(2).optional(),
  paymentMethods: z.string().max(2000).optional().nullable(),
  paymentMethodItems: z
    .array(
      z.object({
        name: z.string().trim().max(80),
        account: z.string().trim().max(160)
      })
    )
    .max(20)
    .optional()
    .transform((items) => items?.filter((item) => item.name || item.account) ?? undefined),
  whatsappMessageTemplate: z
    .string()
    .max(4000)
    .optional()
    .nullable()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    })
    .refine(
      (value) => {
        if (!value) return true;
        return validateOverduePaymentMessageTemplate(value).valid;
      },
      (value) => ({
        message:
          validateOverduePaymentMessageTemplate(value ?? "").message ??
          "La plantilla debe mantener los datos obligatorios."
      })
    )
});

const groupBaseSchema = z.object({
  nombre: z.string().min(2),
  descripcion: z.string().optional().nullable(),
  precioMensualidadDefault: z.coerce.number().nonnegative().optional()
});

export const groupSchema = groupBaseSchema.transform((data) => ({
  ...data,
  precioMensualidadDefault: data.precioMensualidadDefault ?? 0
}));

export const groupUpdateSchema = groupBaseSchema.partial();

const studentBaseSchema = z.object({
  nombre: z.string().min(2),
  apellido: z.string().min(2),
  edad: z.coerce.number().int().min(0).max(120),
  celular: z.string().optional().nullable(),
  esMenorDeEdad: z.coerce.boolean().default(false),
  nombrePadre: z.string().optional().nullable(),
  telefonoPadre: z.string().optional().nullable(),
  parentesco: z.string().optional().nullable(),
  grupoId: z.string().min(1),
  estado: z.enum(["ACTIVO", "PAUSADO", "DESACTIVADO", "INACTIVO"]).optional(),
  precioMensualidad: z.coerce.number().positive().optional().nullable(),
  diaCobro: z.coerce.number().int().min(1).max(28).optional().nullable(),
  modalidadMensualidad: z.enum(["ANTICIPADA", "VENCIDA"]).default("ANTICIPADA"),
  fechaInicioClases: localDateInputSchema.optional().nullable(),
  fechaInicioPausa: localDateInputSchema.optional().nullable(),
  fechaFinPausa: localDateInputSchema.optional().nullable(),
  motivoEstado: z.string().trim().max(500).optional().nullable()
});

const monthlyPeriodSchema = z.object({
  mes: z.coerce.number().int().min(1).max(12),
  anio: z.coerce.number().int().min(2020).max(2100)
});

const studentCreateSchema = studentBaseSchema.extend({
  tipoRegistro: z.enum(["NUEVO", "ANTIGUO"]).default("NUEVO"),
  pagoMesActual: z.coerce.boolean().default(false),
  mensualidadMetodoPagoActual: z.string().optional().nullable(),
  mensualidadFechaPagoActual: localDateInputSchema.optional().nullable(),
  inscripcionMonto: z.coerce.number().positive().optional().nullable(),
  inscripcionPagada: z.coerce.boolean().default(false),
  inscripcionFechaPago: localDateInputSchema.optional().nullable(),
  inscripcionMetodoPago: z.string().optional().nullable(),
  inicioClasesDia: z.coerce.number().int().min(1).max(31).optional().nullable(),
  inicioClasesMes: z.coerce.number().int().min(1).max(12).optional().nullable(),
  inicioClasesAnio: z.coerce.number().int().min(2020).max(2100).optional().nullable(),
  mesesPagados: z.array(monthlyPeriodSchema).default([])
});

export const studentSchema = studentCreateSchema.superRefine((data, ctx) => {
  if (data.esMenorDeEdad && !data.telefonoPadre && !data.celular) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["telefonoPadre"],
      message: "Un menor debe tener teléfono del acudiente o celular registrado"
    });
  }
  if (data.tipoRegistro === "NUEVO" && !data.inscripcionMonto) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["inscripcionMonto"],
      message: "La inscripcion es obligatoria para estudiantes nuevos"
    });
  }
  if (!data.inicioClasesDia) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["inicioClasesDia"],
      message: "Selecciona el dia en que empieza clases"
    });
  }
  if (!data.inicioClasesMes) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["inicioClasesMes"],
      message: "Selecciona el mes en que empieza clases"
    });
  }
  if (!data.inicioClasesAnio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["inicioClasesAnio"],
      message: "Selecciona el año en que empieza clases"
    });
  }
  if (data.inicioClasesDia && data.inicioClasesMes && data.inicioClasesAnio) {
    const startDate = new Date(data.inicioClasesAnio, data.inicioClasesMes - 1, data.inicioClasesDia, 12, 0, 0, 0);
    const isValidStartDate =
      startDate.getFullYear() === data.inicioClasesAnio &&
      startDate.getMonth() === data.inicioClasesMes - 1 &&
      startDate.getDate() === data.inicioClasesDia;

    if (!isValidStartDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inicioClasesDia"],
        message: "Selecciona una fecha de inicio valida"
      });
    }
  }
  if (data.tipoRegistro === "ANTIGUO") {
    if (!data.inicioClasesMes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inicioClasesMes"],
        message: "Selecciona el mes en que empezó clases"
      });
    }
    if (!data.inicioClasesAnio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inicioClasesAnio"],
        message: "Selecciona el año en que empezó clases"
      });
    }
    if (!data.precioMensualidad) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["precioMensualidad"],
        message: "Ingresa la mensualidad del estudiante"
      });
    }
    if (!data.diaCobro) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["diaCobro"],
        message: "Selecciona el día de cobro mensual"
      });
    }

    if (data.inicioClasesMes && data.inicioClasesAnio) {
      const now = new Date();
      const currentPeriodValue = now.getFullYear() * 12 + now.getMonth() + 1;
      const startPeriodValue = data.inicioClasesAnio * 12 + data.inicioClasesMes;

      if (startPeriodValue > currentPeriodValue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inicioClasesMes"],
          message: "El inicio de clases no puede estar en el futuro"
        });
      }

      if (currentPeriodValue - startPeriodValue > 120) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inicioClasesAnio"],
          message: "El historial no puede superar 10 años"
        });
      }

      const paidKeys = new Set<string>();
      for (const period of data.mesesPagados) {
        const periodValue = period.anio * 12 + period.mes;
        const key = `${period.anio}-${period.mes}`;
        if (paidKeys.has(key) || periodValue < startPeriodValue || periodValue > currentPeriodValue) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["mesesPagados"],
            message: "Los meses pagados deben pertenecer al rango generado y no repetirse"
          });
          break;
        }
        paidKeys.add(key);
      }
    }
  }
  if (data.pagoMesActual && !data.mensualidadMetodoPagoActual) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mensualidadMetodoPagoActual"],
      message: "Selecciona como se pago la mensualidad actual"
    });
  }
  if (data.pagoMesActual && !data.mensualidadFechaPagoActual) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mensualidadFechaPagoActual"],
      message: "Selecciona la fecha real del pago"
    });
  }
  if (data.inscripcionPagada && !data.inscripcionFechaPago) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["inscripcionFechaPago"],
      message: "Selecciona la fecha real del pago"
    });
  }
  if (data.tipoRegistro === "ANTIGUO" && data.mesesPagados.length > 0 && !data.mensualidadMetodoPagoActual) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mensualidadMetodoPagoActual"],
      message: "Selecciona como se pagaron los meses marcados"
    });
  }
});

export const studentUpdateSchema = studentBaseSchema.partial();

export const monthlyPaymentSchema = z.object({
  estudianteId: z.string().min(1),
  mes: z.coerce.number().int().min(1).max(12),
  anio: z.coerce.number().int().min(2020).max(2100),
  monto: z.coerce.number().positive(),
  fechaVencimiento: z.coerce.date(),
  metodoPago: z.string().optional().nullable(),
  comprobanteUrl: z.string().url().optional().nullable(),
  notas: z.string().optional().nullable()
});

export const monthlyPaymentUpdateSchema = monthlyPaymentSchema.partial().extend({
  estado: z.enum(["PENDIENTE", "ABONADO", "PAGADO", "VENCIDO", "NO_APLICA"]).optional()
});

export const noAplicaMonthlyPaymentSchema = z.object({
  motivo: z.string().trim().min(3, "Indica el motivo de la excepcion").max(500)
});

export const generateMonthlyByGroupSchema = z.object({
  groupId: z.string().min(1),
  mes: z.coerce.number().int().min(1).max(12),
  anio: z.coerce.number().int().min(2020).max(2100),
  fechaVencimiento: z.coerce.date(),
  monto: z.coerce.number().positive().optional()
});

export const payMonthlySchema = z.object({
  fechaPago: localDateInputSchema.optional(),
  metodoPago: z.string().optional().nullable(),
  comprobanteUrl: z.string().url().optional().nullable(),
  notas: z.string().optional().nullable()
});

export const studentPaymentHistoryUpdateSchema = z.object({
  paymentId: z.string().min(1),
  paid: z.coerce.boolean(),
  fechaPago: localDateInputSchema.optional(),
  metodoPago: z.string().optional().nullable()
});

export const payEnrollmentSchema = z.object({
  fechaPago: localDateInputSchema.optional(),
  metodoPago: z.string().optional().nullable(),
  notas: z.string().optional().nullable()
});

export const paymentInstallmentSchema = z.object({
  monto: z.coerce.number().positive("El valor del abono debe ser mayor a cero"),
  metodoPago: z.string().trim().min(1, "Selecciona un metodo de pago"),
  fechaAbono: localDateInputSchema.optional(),
  notas: z.string().optional().nullable()
});

export const suppliesPaymentSchema = z.object({
  nombreConcepto: z.string().min(2),
  descripcion: z.string().optional().nullable(),
  monto: z.coerce.number().positive(),
  grupoId: z.string().optional().nullable(),
  estudianteId: z.string().optional().nullable(),
  studentIds: z.array(z.string()).optional(),
  fechaVencimiento: z.coerce.date()
});

export const expenseSchema = z.object({
  concepto: z.string().min(2),
  descripcion: z.string().optional().nullable(),
  monto: z.coerce.number().positive(),
  fecha: localDateInputSchema,
  categoria: z.string().optional().nullable()
});

export const savePushTokenSchema = z.object({
  token: z.string().min(10),
  platform: z.string().optional(),
  deviceName: z.string().optional()
});

export const webPushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().int().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(10),
    auth: z.string().min(5)
  }),
  userAgent: z.string().optional(),
  deviceName: z.string().optional()
});

export const deleteWebPushSubscriptionSchema = z.object({
  endpoint: z.string().url()
});

export const sendNotificationSchema = z.object({
  title: z.string().min(2),
  body: z.string().min(2),
  data: z.record(z.any()).optional()
});

export const whatsappReminderSchema = z
  .object({
    monthlyPaymentId: z.string().min(1).optional(),
    enrollmentPaymentId: z.string().min(1).optional(),
    monthlyPaymentIds: z.array(z.string().min(1)).optional(),
    enrollmentPaymentIds: z.array(z.string().min(1)).optional()
  })
  .refine(
    (data) =>
      Boolean(data.monthlyPaymentId) ||
      Boolean(data.enrollmentPaymentId) ||
      Boolean(data.monthlyPaymentIds?.length) ||
      Boolean(data.enrollmentPaymentIds?.length),
    { message: "Debes enviar al menos una mensualidad o una inscripcion" }
  );

export const subscriptionPaymentSchema = z.object({
  paymentMethod: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  paidAt: localDateInputSchema.optional()
});
