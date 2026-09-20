/**
 * Formato y limpieza de los importes que se escriben en el panel.
 *
 * Vive aparte del componente para poder usarlo desde el servidor o desde otro
 * campo sin arrastrar React.
 */

/** Solo digitos: al escribir se descarta cualquier otra cosa. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * `2000000` -> `2.000.000`.
 *
 * Vacio se queda vacio a proposito: mostrar un `0` de relleno haria que el
 * campo pareciera tener un valor puesto cuando nadie ha escrito nada.
 */
export function formatThousands(value: string): string {
  const digits = onlyDigits(value);
  if (!digits) return "";
  return Number(digits).toLocaleString("es-CO");
}

/** El numero que representa el campo. Vacio vale cero. */
export function parseMoney(value: string): number {
  const digits = onlyDigits(value);
  return digits ? Number(digits) : 0;
}
