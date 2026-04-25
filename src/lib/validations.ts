import { z } from "zod";

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
  businessName: z.string().min(2).optional()
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
  estado: z.enum(["ACTIVO", "INACTIVO"]).optional(),
  precioMensualidad: z.coerce.number().positive().optional().nullable(),
  diaCobro: z.coerce.number().int().min(1).max(28).optional().nullable()
});

export const studentSchema = studentBaseSchema.superRefine((data, ctx) => {
  if (data.esMenorDeEdad && !data.telefonoPadre && !data.celular) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["telefonoPadre"],
      message: "Un menor debe tener teléfono del acudiente o celular registrado"
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

export const generateMonthlyByGroupSchema = z.object({
  groupId: z.string().min(1),
  mes: z.coerce.number().int().min(1).max(12),
  anio: z.coerce.number().int().min(2020).max(2100),
  fechaVencimiento: z.coerce.date(),
  monto: z.coerce.number().positive().optional()
});

export const payMonthlySchema = z.object({
  fechaPago: z.coerce.date().optional(),
  metodoPago: z.string().optional().nullable(),
  comprobanteUrl: z.string().url().optional().nullable(),
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
  fecha: z.coerce.date(),
  categoria: z.string().optional().nullable()
});

export const savePushTokenSchema = z.object({
  token: z.string().min(10),
  platform: z.string().optional(),
  deviceName: z.string().optional()
});

export const sendNotificationSchema = z.object({
  title: z.string().min(2),
  body: z.string().min(2),
  data: z.record(z.any()).optional()
});

export const whatsappReminderSchema = z.object({
  monthlyPaymentId: z.string().min(1)
});
