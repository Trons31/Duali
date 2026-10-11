# 025 · Móvil sin desbordes

**Estado:** Implementada y probada · **Fecha:** 2026-10-10

## Contexto

En el celular varias pantallas se salían por la derecha: las tarjetas quedaban
cortadas ("vence 8 de no…", la etiqueta "Vigente" pegada al borde, botones
partidos). Pasaba en la ficha del cliente, en Planes, en Clientes y en Avisos.

Una auditoría con Chromium a 320 y 360 px sobre la app real (todas las rutas del
panel, login y página pública, con datos de prueba) encontró **una sola causa**:

> Contenedores `grid` sin columnas en móvil (`grid gap-4 lg:grid-cols-3`). En
> móvil el grid usa una columna implícita `auto`, y en CSS un hijo de grid tiene
> `min-width: auto`: la columna crece hasta el ancho mínimo de su contenido más
> ancho (una fila de pestañas, de chips o de botones) en lugar de ajustarse a la
> pantalla. Todo lo de esa columna se estira y se corta.

| Pantalla | Ancho de la pantalla | Ancho al que se estiraba |
| -------- | -------------------- | ------------------------ |
| Avisos | 360 | 490 |
| Clientes | 360 | 478 |
| Clientes › Planes | 360 | 395 |
| Ficha del cliente | 320 | 345 (más con comprobante por revisar) |

Hay 87 grids así en `src/`. Arreglarlos uno a uno no evita que el siguiente
grid nuevo vuelva a romper el ancho; por eso la corrección es global y queda
cubierta por una prueba que recorre todas las pantallas.

## Requisitos

- **R1 — Ningún hijo de grid empuja el ancho** (`src/app/globals.css`).
  Regla base `.grid > * { min-width: 0 }`: los hijos de un grid pueden ser tan
  angostos como su columna, y lo que no quepa se acomoda dentro (envuelve, se
  trunca o se desplaza en su propio carrusel) en vez de estirar la página.
- **R2 — El contenido del panel no se sale de `main`**
  (`components/dashboard/shell.tsx`). `main` y su columna llevan `min-w-0`, para
  que un hijo ancho no pueda ensanchar la columna del panel.
- **R3 — El aviso de la cabecera no deja un hueco en blanco.** El aviso rotativo
  ("6 mensualidades vencidas") se desvanecía del todo en cada vuelta y la
  cabecera quedaba con una franja blanca vacía. Ahora nunca baja de una opacidad
  legible.
- **R3b — Ajustes por pantalla** (lo que cabía pero se veía mal en las capturas):
  - Ficha del cliente (`studio-member-detail.tsx`): en el celular los botones
    WhatsApp / Editar / Más bajan a su propia fila y el nombre usa todo el ancho
    (antes quedaba "Dani…"). Las fechas de la próxima clase y de "cliente desde"
    envuelven en vez de cortarse, y ya no ponen mayúscula a cada palabra
    ("Lun, 12 de oct · 6:00 p. m.", no "Lun, 12 De Oct · 6:00 P. M.").
  - Planes vendidos (`member-sales-panel.tsx`): la línea plan · disciplina
    envuelve y la etiqueta "Compró en línea" se ve completa.
  - Alumnos (`students-panel-cards.tsx`): en el celular el botón de filtros
    muestra solo el ícono, para que la búsqueda tenga espacio.
- **R4 — Prueba de ancho en móvil** (`tests/e2e/mobile.e2e.test.ts`). Abre en
  Chromium real, a 320, 360 y 390 px, todas las pantallas del panel, el login y
  la página pública, con datos que fuerzan los casos difíciles: nombres largos,
  negocio de nombre largo, saldos, clases reservadas y una compra en línea con
  comprobante por revisar (el caso de la captura). Falla si:
  - el documento es más ancho que la pantalla, o
  - algún elemento visible se sale por la derecha o la izquierda, salvo dentro
    de un carrusel horizontal propio (`overflow-x: auto`).
  El mensaje de falla dice la pantalla, el ancho y el elemento que se sale.

## Criterios de aceptación

- A 320, 360 y 390 px ninguna pantalla tiene desplazamiento horizontal y
  ninguna tarjeta queda cortada.
- La ficha del cliente con compra en línea y comprobante por revisar se ve
  completa: etiqueta "Vigente", "vence 8 de nov", botones y pestañas.
- En escritorio (≥ 1280 px) el panel se ve igual que antes.

## Fuera de alcance

- Rediseñar pantallas: solo se corrige el ancho.
- Las tablas anchas que ya viven dentro de un carrusel horizontal propio.
- La App móvil nativa (otro repositorio).

## Pruebas

| Tipo | Archivo | Qué cubre |
| ---- | ------- | --------- |
| E2E | `tests/e2e/mobile.e2e.test.ts` | R1–R4 en todas las rutas a 320/360/390 px |

La prueba usa `playwright-core` y el Chromium de Playwright. En una máquina
nueva: `npx playwright-core install chromium`. `MOBILE_SHOTS=<carpeta>` guarda una
captura por pantalla para revisarlas a ojo y `MOBILE_WIDTHS=1280` corre los
mismos chequeos en escritorio.
