# 012 · Experiencia de la página pública (rediseño)

**Estado:** Implementada y probada · **Fecha:** 2026-10-09

## Contexto

La primera versión (008/009) copiaba la reserva de CliqCut: fondo oscuro y una
lista larga de días. Al usuario no le gustó ("se ve feo") y pidió un diseño
distinto a CliqCut, **elegante, llamativo, bonito, fácil e intuitivo**, a criterio
del equipo. Excepción explícita a la regla "CliqCut es la referencia" para la
página pública.

## Objetivo de experiencia

Que una persona que llega desde Instagram o WhatsApp **entienda en 5 segundos qué
ofrece el estudio, cuánto cuesta y cuándo hay clase, y aparte su cupo en 3 toques**:
Reservar (en la clase) → sus datos → confirmar. Elegante, bonito y moderno, sin
sacrificar claridad.

## Principios de UX

1. **Una acción principal siempre a la vista:** "Reservar clase" en la portada,
   en cada clase y en una barra fija abajo en el celular.
2. **Menos pasos:** reservar desde la clase salta el paso "Elige tu clase";
   elegir un plan lo deja preseleccionado en el asistente.
3. **Información honesta y útil:** precios reales, precio por clase calculado,
   cupos libres reales; nada inventado ("más popular" sin datos, no).
4. **Celular primero:** áreas táctiles ≥ 44 px, texto ≥ 14 px, sin desplazamiento
   horizontal salvo en carruseles de días/disciplinas con indicio visual.
5. **Lectura rápida:** jerarquía tipográfica clara (serif para títulos, Inter para
   datos), mucho aire, una idea por tarjeta.
6. **Retroalimentación:** estados de carga en botones, mensajes de error en
   lenguaje humano, confirmación clara al reservar.
7. **Accesible:** contraste AA, foco visible con teclado, `aria-pressed` en
   selectores, textos alternativos en imágenes, animaciones suaves que respetan
   `prefers-reduced-motion`.
8. **Rápida:** todo el contenido se arma en el servidor (se ve sin esperar
   JavaScript); imágenes con `loading="lazy"` salvo la portada.

## Dirección de diseño

Editorial y cálida, inspirada en las historias de Instagram del estudio (títulos
en serif itálica sobre foto, mucho aire):

- Fondo crema claro, tarjetas blancas, texto casi negro; botones en píldora negra.
- Títulos en **Instrument Serif** itálica (Google Fonts vía `next/font`); el resto en Inter.
- Los colores de cada disciplina dan el acento (puntos, barras, degradados).

## Requisitos

- **R1 — Portada:** foto del estudio con degradado encima; sin foto, un degradado
  con los colores de las disciplinas. Nombre grande en serif, frase con las
  disciplinas, botones **Reservar clase** y **Ver planes**, y datos reales:
  clases de la semana y "desde $X".
- **R2 — Navegación** por secciones (Horario · Planes · Novedades · Pagos), fija al bajar.
- **R3 — Horario interactivo:** selector de días; cada clase con hora, disciplina,
  instructor, barra de cupos y botón **Reservar** que abre el asistente ya en
  "Tus datos" (`/reservar?h={horario}&f={fecha}`). Llenas y canceladas, deshabilitadas.
- **R4 — Disciplinas:** tarjetas con su imagen o un degradado de su color y "desde $X".
- **R5 — Planes:** pestañas por disciplina; tarjetas con clases, precio y
  **precio por clase** calculado; la de menor precio por clase lleva "Mejor valor"
  (solo si hay más de un plan). "Elegir este plan" abre el asistente con el plan
  preseleccionado (`?plan=`).
- **R6 — Novedades y Pagos** con el mismo estilo; botón **Copiar** en cada cuenta.
- **R7 — Celular:** barra fija abajo con **Reservar clase** y WhatsApp.
- **R8 — Asistente y página de la reserva** con el mismo estilo claro.
- Nada cambia en datos ni API: solo presentación (y los parámetros `h`, `f`, `plan`).

## Criterios de aceptación

UX:

- [x] Desde la página, reservar con un plan vigente toma 3 toques (Reservar en la clase → Apartar mi cupo tras escribir datos).
- [x] En el celular la barra "Reservar clase" está siempre visible.
- [x] Botones y selectores tienen área táctil ≥ 44 px y foco visible.

Funcionales:

- [x] La portada muestra nombre, disciplinas, "desde $X" y clases de la semana con datos reales.
- [x] Cada clase tiene un enlace Reservar a `/s/{slug}/reservar?h=…&f=…`; una clase llena no.
- [x] Con `?h&f` el asistente abre directo en "Tus datos" con esa clase.
- [x] "Mejor valor" marca el plan de menor precio por clase de cada disciplina.
- [x] La página sigue sin mostrar nombres de clientes.
- [x] Todas las pruebas existentes de 008/009 siguen pasando.

## Pruebas

- Unitarias: `src/lib/public-presentation.test.ts` (precio por clase, mejor valor, "desde", frase de
  disciplinas, enlaces de reserva). Encontró que en el menú real el mejor valor es Premium ($13.333/clase),
  no Full Studiodance ($13.500).
- E2E: portada con datos reales, enlace Reservar por clase (`?h&f`), asistente directo en "Tus datos",
  "Mejor valor" y precio por clase, sin nombres de clientes; las pruebas de 008/009 siguen pasando.
- Revisión visual con capturas de Chrome sin ventana (celular 500 px y escritorio 1366 px). La barra fija
  del celular y las áreas táctiles de 44 px (`min-h-11`) se verificaron en esas capturas y en el código.

## Fuera de alcance

- Temas o colores personalizables por estudio.
- Logo propio del estudio (se usa la inicial).
