import { z } from "zod";
import { DISCIPLINE_COLORS, normalizeMemberPhone, slugProblem } from "@/lib/studio-constants";
import { isDateKey, isTimeKey } from "@/lib/studio-time";
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
  moduloAcademia: z.boolean().optional(),
  moduloEstudio: z.boolean().optional(),
  horasCancelacion: z.coerce.number().int().min(0).max(168).optional(),
  devolverClaseInasistencia: z.boolean().optional(),
  permitirPagoEnEstudio: z.boolean().optional(),
  exigirPagoValidado: z.boolean().optional(),
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
  // Por defecto true: las peticiones antiguas (app movil, integraciones) que no
  // envian el campo siguen comportandose como antes.
  cobraInscripcion: z.coerce.boolean().default(true),
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
  // La inscripcion es opcional: hay negocios que no la cobran. Solo se exige
  // el valor cuando el cliente activa el cobro de inscripcion.
  if (data.tipoRegistro === "NUEVO" && data.cobraInscripcion && !data.inscripcionMonto) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["inscripcionMonto"],
      message: "Ingresa el valor de la inscripcion"
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
  motivo: z.string().trim().min(3, "Indica el motivo de la excepcion").max(500),
  fechaProximoCobro: localDateInputSchema.optional().nullable()
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

// ─── Modo Estudio (specs 003 y 004) ───────────────────────────────────────────

export const disciplineSchema = z.object({
  tipo: z.enum(["CLASE", "COMBO"]).default("CLASE"),
  nombre: z.string().trim().min(2, "El nombre es muy corto").max(60),
  descripcion: z
    .string()
    .trim()
    .max(400)
    .optional()
    .nullable()
    // undefined se respeta para que un PUT parcial no borre la descripcion.
    .transform((value) => (value === undefined ? undefined : value || null)),
  color: z.enum(DISCIPLINE_COLORS),
  activa: z.boolean().optional(),
  orden: z.coerce.number().int().min(0).optional(),
  // Solo para combos: las disciplinas tipo CLASE que incluye.
  incluyeIds: z.array(z.string().min(1)).max(30).optional(),
  // Spec 010: imagen de la disciplina en Cloudinary (null la quita).
  imagen: z
    .object({ url: z.string().url().max(500), publicId: z.string().min(1).max(300) })
    .optional()
    .nullable()
});

const packageFieldsSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es muy corto").max(60),
  clases: z.coerce.number().int().min(1, "Mínimo 1 clase").max(200),
  precio: z.coerce.number().min(0).max(100_000_000),
  vigenciaDias: z.coerce.number().int().min(1).max(366).default(30),
  visiblePublico: z.boolean().default(true),
  activo: z.boolean().default(true),
  orden: z.coerce.number().int().min(0).optional()
});

export const packageCreateSchema = packageFieldsSchema.extend({
  disciplineIds: z.array(z.string().min(1)).min(1, "Elige al menos una disciplina").max(30)
});

export const packageUpdateSchema = packageFieldsSchema.partial();

// ─── Modo Estudio: horario y cupos (spec 005) ─────────────────────────────────

const dateKeySchema = z.string().refine(isDateKey, "Fecha inválida (YYYY-MM-DD)");
const timeKeySchema = z.string().refine(isTimeKey, "Hora inválida (HH:mm)");
const optionalTextSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value === undefined ? undefined : value || null));

const classScheduleFieldsSchema = z.object({
  disciplineId: z.string().min(1),
  horaInicio: timeKeySchema,
  duracionMin: z.coerce.number().int().min(15, "Mínimo 15 minutos").max(240, "Máximo 4 horas"),
  cupo: z.coerce.number().int().min(1, "Mínimo 1 cupo").max(500),
  instructor: optionalTextSchema(80),
  activo: z.boolean().optional()
});

export const classScheduleCreateSchema = classScheduleFieldsSchema.extend({
  dias: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Elige al menos un día").max(7)
});

export const classScheduleUpdateSchema = classScheduleFieldsSchema
  .extend({ diaSemana: z.coerce.number().int().min(1).max(7) })
  .partial();

export const classSessionsQuerySchema = z
  .object({ from: dateKeySchema, to: dateKeySchema })
  .refine((value) => value.from <= value.to, "El rango está invertido");

export const classSessionUpdateSchema = z.object({
  scheduleId: z.string().min(1),
  fecha: dateKeySchema,
  cupo: z.coerce.number().int().min(1).max(500).optional(),
  cancelada: z.boolean().optional(),
  motivoCancelacion: optionalTextSchema(200)
});

// ─── Modo Estudio: clientes y ventas (spec 006) ───────────────────────────────

export const STUDIO_PAYMENT_METHODS = ["EFECTIVO", "NEQUI", "BANCOLOMBIA", "TRANSFERENCIA", "OTRO"] as const;

export const studioMemberSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es muy corto").max(60),
  apellido: optionalTextSchema(60),
  celular: z
    .string()
    .transform(normalizeMemberPhone)
    .refine((value) => value.length >= 7 && value.length <= 15, "Celular inválido"),
  email: z
    .string()
    .trim()
    .max(120)
    .optional()
    .nullable()
    .transform((value) => (value === undefined ? undefined : value?.toLowerCase() || null))
    .refine((value) => !value || z.string().email().safeParse(value).success, "Correo inválido"),
  fechaNacimiento: dateKeySchema.optional().nullable(),
  notas: optionalTextSchema(500)
});

const studioPaymentSchema = z.object({
  monto: z.coerce.number().positive("El monto debe ser mayor a 0").max(100_000_000),
  metodoPago: z.enum(STUDIO_PAYMENT_METHODS)
});

export const memberPackageSaleSchema = z.object({
  memberId: z.string().min(1),
  packageId: z.string().min(1),
  inicio: dateKeySchema.optional(),
  precio: z.coerce.number().min(0).max(100_000_000).optional(),
  notas: optionalTextSchema(300),
  pago: studioPaymentSchema.optional()
});

export const memberPackageUpdateSchema = z.union([
  z.object({ vence: dateKeySchema }),
  z.object({ anular: z.literal(true), motivo: optionalTextSchema(200) })
]);

export const memberPackagePaymentSchema = studioPaymentSchema.extend({
  fecha: dateKeySchema.optional(),
  notas: optionalTextSchema(200)
});

// ─── Modo Estudio: reservas (spec 007) ────────────────────────────────────────

export const bookingCreateSchema = z.object({
  scheduleId: z.string().min(1),
  fecha: dateKeySchema,
  memberId: z.string().min(1),
  memberPackageId: z.string().min(1).optional(),
  /** Spec 019 R7: llego sin reservar; queda con asistencia. */
  llegoSinReservar: z.boolean().optional(),
  venta: z
    .object({
      packageId: z.string().min(1),
      precio: z.coerce.number().min(0).max(100_000_000).optional(),
      pago: studioPaymentSchema.optional()
    })
    .optional()
});

export const bookingUpdateSchema = z.union([
  z.object({ cancelar: z.literal(true), devolverClase: z.boolean().optional() }),
  z.object({ estado: z.enum(["RESERVADA", "ASISTIO", "NO_ASISTIO"]) })
]);

export const attendanceAllSchema = z.object({ scheduleId: z.string().min(1), fecha: dateKeySchema });

export const bookingsQuerySchema = z.union([
  z.object({ scheduleId: z.string().min(1), fecha: dateKeySchema }),
  z.object({ memberId: z.string().min(1) })
]);

// ─── Pagina publica y reserva web (specs 008 y 009) ───────────────────────────

export const publicPageSchema = z.object({
  portada: z.lazy(() => mediaInputSchema).optional().nullable(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .superRefine((value, ctx) => {
      const problem = slugProblem(value);
      if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
    })
    .optional(),
  paginaPublicaActiva: z.boolean().optional()
});

const publicPhoneSchema = z
  .string()
  .transform(normalizeMemberPhone)
  .refine((value) => value.length >= 7 && value.length <= 15, "Celular inválido");
const publicNameSchema = z.string().trim().min(2, "Escribe tu nombre").max(60);

/** Spec 021 D2: el comprobante (foto como data URL) o pagar en el estudio. */
export const onlinePaymentSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("COMPROBANTE"),
    // ~4 MB en base64; el detalle (tipo y peso) lo revisa receiptDataUrlProblem.
    comprobante: z.string().max(6_000_000),
    metodo: z.string().trim().min(1, "Elige un método de pago").max(80)
  }),
  z.object({ tipo: z.literal("EN_ESTUDIO") })
]);

export const publicBookingSchema = z
  .object({
    scheduleId: z.string().min(1),
    fecha: dateKeySchema,
    celular: publicPhoneSchema.optional(),
    nombre: publicNameSchema.optional(),
    apellido: optionalTextSchema(60),
    packageId: z.string().min(1).optional(),
    // Spec 021 R9: desde Mi plan, la identidad viene del enlace privado.
    planToken: z.string().min(10).max(100).optional(),
    // Spec 021 R5: validar y mostrar el plan que se usaria, sin reservar.
    vistaPrevia: z.boolean().optional(),
    // Spec 021 R6: pago de lo que se compra al reservar.
    pago: onlinePaymentSchema.optional()
  })
  .refine((value) => value.planToken || (value.celular && value.nombre), { message: "Escribe tu celular y tu nombre", path: ["celular"] });

/** Spec 021 R3. */
export const publicPlanPurchaseSchema = z.object({
  packageId: z.string().min(1),
  celular: publicPhoneSchema,
  nombre: publicNameSchema,
  apellido: optionalTextSchema(60),
  pago: onlinePaymentSchema
});

export const publicPlanReceiptSchema = z.object({
  comprobante: z.string().max(6_000_000),
  metodo: z.string().trim().min(1, "Elige un método de pago").max(80)
});

export const publicBookingUpdateSchema = z.object({ cancelar: z.literal(true) });

// ─── Lista de espera (spec 015) ───────────────────────────────────────────────

export const publicWaitlistUpdateSchema = z.object({ salir: z.literal(true) });

export const waitlistQuerySchema = z.object({ scheduleId: z.string().min(1), fecha: dateKeySchema });

// ─── Contenido y archivos (spec 010) ──────────────────────────────────────────

export const mediaInputSchema = z.object({
  url: z.string().url().max(500),
  publicId: z.string().min(1).max(300)
});

export const mediaSignatureSchema = z.object({
  kind: z.enum(["IMAGEN", "VIDEO"]),
  use: z.enum(["publicaciones", "disciplinas", "portada"])
});

export const mediaDiscardSchema = z.object({
  publicId: z.string().min(1).max(300),
  kind: z.enum(["IMAGEN", "VIDEO"])
});

export const contentPostSchema = z.object({
  tipo: z.enum(["PUBLICACION", "VIDEO"]),
  titulo: z.string().trim().min(2, "Escribe un título").max(120),
  cuerpo: optionalTextSchema(3000),
  disciplineId: z.string().min(1).optional().nullable(),
  media: mediaInputSchema.optional().nullable(),
  enlaceVideo: z.string().trim().max(500).optional().nullable(),
  publicado: z.boolean().optional(),
  fijado: z.boolean().optional()
});

// ─── Avisos del estudio (spec 011) ────────────────────────────────────────────

export const studioMessageSentSchema = z.object({
  tipo: z.enum(["RECORDATORIO_CLASE", "PAQUETE_POR_VENCER", "SALDO", "CLASE_CANCELADA", "CUPO_LISTA_ESPERA"]),
  refKey: z.string().min(1).max(200),
  memberId: z.string().min(1)
});

// ─── Comprobantes de pago (spec 014) ──────────────────────────────────────────

export const receiptApproveSchema = z.object({
  monto: z.coerce.number().positive("El monto debe ser mayor a 0").max(100_000_000),
  metodoPago: z.enum(STUDIO_PAYMENT_METHODS)
});

export const receiptRejectSchema = z.object({ motivo: optionalTextSchema(200) });

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
