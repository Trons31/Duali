export const OVERDUE_PAYMENT_MESSAGE_VARIABLES = [
  "nombre_estudiante",
  "cantidad_mensualidades_vencidas",
  "mensualidades_vencidas",
  "valor_mensualidad",
  "tiene_inscripcion_vencida",
  "valor_inscripcion",
  "total_pendiente"
] as const;

export const OVERDUE_PAYMENT_MESSAGE_TEMPLATE =
  "Buenas, Bendiciones, te recordamos que {{nombre_estudiante}} tiene una mensualidad vencida: {{mensualidades_vencidas}}, por un valor pendiente de {{total_pendiente}}. Por favor realiza el pago lo antes posible para ponerte al día.";

export const OVERDUE_PAYMENT_MESSAGE_TEMPLATES = {
  singleMonthly:
    "Buenas, Bendiciones, te recordamos que {{nombre_estudiante}} tiene una mensualidad vencida: {{mensualidades_vencidas}}, por un valor pendiente de {{total_pendiente}}. Por favor realiza el pago lo antes posible para ponerte al día.",
  multipleMonthly:
    "Buenas, Bendiciones, te recordamos que {{nombre_estudiante}} tiene {{cantidad_mensualidades_vencidas}} mensualidades vencidas: {{mensualidades_vencidas}}. El valor de cada mensualidad es {{valor_mensualidad}} y el valor total pendiente es {{total_pendiente}}. Por favor realiza el pago lo antes posible para ponerte al día.",
  enrollmentOnly:
    "Buenas, Bendiciones, te recordamos que {{nombre_estudiante}} tiene vencida la inscripción, por un valor pendiente de {{total_pendiente}}. Por favor realiza el pago lo antes posible para ponerte al día.",
  singleMonthlyAndEnrollment:
    "Buenas, Bendiciones, te recordamos que {{nombre_estudiante}} tiene una mensualidad vencida: {{mensualidades_vencidas}}, y también tiene vencida la inscripción por un valor de {{valor_inscripcion}}. El valor de la mensualidad es {{valor_mensualidad}} y el valor total pendiente es {{total_pendiente}}. Por favor realiza el pago lo antes posible para ponerte al día.",
  monthlyAndEnrollment:
    "Buenas, Bendiciones, te recordamos que {{nombre_estudiante}} tiene {{cantidad_mensualidades_vencidas}} mensualidades vencidas: {{mensualidades_vencidas}}, y también tiene vencida la inscripción por un valor de {{valor_inscripcion}}. El valor de cada mensualidad es {{valor_mensualidad}} y el valor total pendiente es {{total_pendiente}}. Por favor realiza el pago lo antes posible para ponerte al día."
} as const;

const REQUIRED_VARIABLE_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export function validateOverduePaymentMessageTemplate(template: string) {
  const variables = Array.from(template.matchAll(REQUIRED_VARIABLE_PATTERN), (match) => match[1]);

  if (!variables.includes("nombre_estudiante")) {
    return {
      valid: false,
      message: "La plantilla debe incluir {{nombre_estudiante}}."
    };
  }

  if (!variables.includes("total_pendiente")) {
    return {
      valid: false,
      message: "La plantilla debe incluir {{total_pendiente}}."
    };
  }

  return { valid: true, message: null };
}
