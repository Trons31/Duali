// Formas de pago de los instructores (spec 023 D1, D2 y D4). Funciones puras:
// las usan el servidor (ciclos), el formulario (ejemplo en vivo) y las pruebas.

export const INSTRUCTOR_VARIABLES = ["POR_CLASE", "ALUMNO_FIJO", "ALUMNO_PORCENTAJE"] as const;
export type InstructorVariable = (typeof INSTRUCTOR_VARIABLES)[number];

/** Lo que el formulario elige primero (D1). */
export type PayKind = "SUELDO" | "POR_CLASE" | "POR_ALUMNO" | "SUELDO_VARIABLE";

export type InstructorPay = {
  sueldo: number | null;
  variable: InstructorVariable | null;
  /** Pesos, o un % con ALUMNO_PORCENTAJE. */
  valor: number | null;
  minimoPorClase: number | null;
  alumnosMinimos: number;
  /** D4: valor propio por disciplina (mismo significado que `valor`). */
  valoresDisciplina?: Record<string, number | null | undefined>;
};

export function payKind(pay: Pick<InstructorPay, "sueldo" | "variable">): PayKind {
  if (pay.sueldo != null && pay.variable) return "SUELDO_VARIABLE";
  if (pay.sueldo != null) return "SUELDO";
  return pay.variable === "POR_CLASE" ? "POR_CLASE" : "POR_ALUMNO";
}

/** D2: lo que aporta una asistencia: precio del plan ÷ sus clases (una clase suelta, su precio). */
export function attendanceValue(sale: { precio: number; clases: number }) {
  return sale.clases > 0 ? sale.precio / sale.clases : 0;
}

/** D4: el valor de la disciplina si tiene uno propio; si no, el general. */
export function valueFor(pay: InstructorPay, disciplineId?: string | null) {
  const own = disciplineId ? pay.valoresDisciplina?.[disciplineId] : null;
  return own ?? pay.valor ?? 0;
}

export type ClassEarning = {
  ganado: number;
  /** VARIABLE: lo calculado; MINIMO: se subio al minimo; POCOS_ALUMNOS: no llego a los alumnos minimos; SIN_VARIABLE: sueldo fijo. */
  regla: "VARIABLE" | "MINIMO" | "POCOS_ALUMNOS" | "SIN_VARIABLE";
  valorAplicado: number;
};

/**
 * D1: lo que gana el instructor por una clase dictada. `valorClases` es la suma
 * de lo que aporta cada alumno (D2), solo se usa con ALUMNO_PORCENTAJE.
 */
export function classEarning(
  pay: InstructorPay,
  input: { disciplineId?: string | null; alumnos: number; valorClases: number; pagarClasesVacias?: boolean }
): ClassEarning {
  if (!pay.variable) return { ganado: 0, regla: "SIN_VARIABLE", valorAplicado: 0 };
  const valorAplicado = valueFor(pay, input.disciplineId);
  // D3: una clase sin alumnos solo se paga por clase dictada y con "Pagar clases aunque no llegue nadie".
  const emptyPaid = pay.variable === "POR_CLASE" && input.alumnos === 0 && input.pagarClasesVacias && pay.alumnosMinimos <= 1;
  if (input.alumnos < Math.max(pay.alumnosMinimos, 1) && !emptyPaid) {
    return { ganado: 0, regla: "POCOS_ALUMNOS", valorAplicado };
  }

  const raw =
    pay.variable === "POR_CLASE"
      ? valorAplicado
      : pay.variable === "ALUMNO_FIJO"
        ? valorAplicado * input.alumnos
        : (input.valorClases * valorAplicado) / 100;
  const ganado = Math.round(raw);
  const minimo = pay.minimoPorClase ?? 0;
  if (pay.variable !== "POR_CLASE" && minimo > ganado) return { ganado: Math.round(minimo), regla: "MINIMO", valorAplicado };
  return { ganado, regla: "VARIABLE", valorAplicado };
}

function money(value: number) {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

function variableLabel(variable: InstructorVariable, valor: number) {
  if (variable === "POR_CLASE") return `${money(valor)} por clase`;
  if (variable === "ALUMNO_FIJO") return `${money(valor)} por alumno`;
  return `${valor.toLocaleString("es-CO")} % por alumno`;
}

/** Una linea para tarjetas y listas: "Por alumno · $6.000 · mín. $30.000 por clase". */
export function describePay(pay: InstructorPay) {
  const kind = payKind(pay);
  if (kind === "SUELDO") return `Sueldo fijo · ${money(pay.sueldo ?? 0)}`;
  const variable = variableLabel(pay.variable!, pay.valor ?? 0);
  const extras = [
    pay.minimoPorClase && pay.variable !== "POR_CLASE" ? `mín. ${money(pay.minimoPorClase)} por clase` : null,
    pay.alumnosMinimos > 1 ? `desde ${pay.alumnosMinimos} alumnos` : null
  ].filter(Boolean);
  const base = kind === "SUELDO_VARIABLE" ? `Sueldo ${money(pay.sueldo ?? 0)} + ${variable}` : variable;
  return [base, ...extras].join(" · ");
}

/**
 * R2: el ejemplo en vivo del formulario, con una clase llena y una floja. Para
 * el porcentaje se supone que cada alumno aporta `valorPorAlumno` (un plan de
 * $160.000 con 8 clases aporta $20.000).
 */
export function payExample(pay: InstructorPay, valorPorAlumno = 20000) {
  if (!pay.variable) return [`Recibe ${money(pay.sueldo ?? 0)} por ciclo de sueldos, dicte lo que dicte.`];
  const lines = [8, 3].map((alumnos) => {
    const result = classEarning(pay, { alumnos, valorClases: alumnos * valorPorAlumno });
    const why = result.regla === "MINIMO" ? " (el mínimo)" : result.regla === "POCOS_ALUMNOS" ? " (no llega a los alumnos mínimos)" : "";
    return `Una clase con ${alumnos} alumnos le deja ${money(result.ganado)}${why}.`;
  });
  if (pay.variable === "ALUMNO_PORCENTAJE") lines.push(`Si cada alumno aporta ${money(valorPorAlumno)} (un plan de $160.000 con 8 clases).`);
  if (pay.sueldo != null) lines.unshift(`Sueldo de ${money(pay.sueldo)} por ciclo de sueldos, y además:`);
  return lines;
}
