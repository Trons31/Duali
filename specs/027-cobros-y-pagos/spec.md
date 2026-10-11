# 027 · Cobros ordenados, venta de varios paquetes y pago en dos partes

**Estado:** Implementada y probada · **Fecha:** 2026-10-11

## Contexto

Pedido de la dueña, con capturas de la ficha del cliente y de CliqCut:

1. En la tarjeta del plan, la fila de pestañas *Pagos · Comprobantes · Clases*
   muestra una barra de scroll **vertical** (el globo del contador es un poco más
   alto que la fila y `overflow-x-auto` también recorta en vertical).
2. Un cliente puede tener paquetes de **varias disciplinas**, pero *Vender
   paquete* solo deja elegir uno por venta.
3. Al registrar un pago no hay **resumen** y no se puede pagar en **dos partes**
   (p. ej. $100.000 en efectivo y $60.000 por Nequi). En CliqCut el registro va
   **paso a paso** y el último paso es el pago, con "Pago en dos partes".
4. Lo anterior debe valer en **todo Duali** donde se registra un pago: paquetes,
   mensualidades e inscripciones de la academia, egresos y pagos a instructores.
5. Los cobros del estudio están repartidos (pestaña Pagos de Clientes, ficha del
   cliente). Falta una **página dedicada**, como *Cobros* de la academia, con
   pestañas de pendientes, vencidos e historial.

## Referencias

- **CliqCut** `components/payments/PaymentBreakdownSelector.tsx` y
  `lib/payment-breakdown.ts`: un método o dos partes que deben sumar el total.
- **CliqCut** `components/ui/ModalSteps.tsx` y `RegisterSessionModal.tsx`: tira
  de pasos (número + nombre, check al completar) y botones Atrás / Continuar.
- **Duali** spec 023 D8 (`InstructorPaymentMethod`): ya guarda pagos a
  instructores en dos formas.

## Decisiones (aprobadas por la dueña el 2026-10-11)

- **D1 — Varios paquetes en una venta.** *Vender paquetes* es un asistente de
  tres pasos: **1 Paquetes** (uno o varios, de distintas disciplinas) →
  **2 Detalles** (inicio y precio de cada uno) → **3 Pago** (resumen con el total
  y el pago). Cada paquete queda como su propio plan.
- **D2 — Pago en dos partes en todas partes.** Un componente común
  (`PaymentBreakdown`) con los métodos de Duali y el botón *Pago en dos partes*:
  dos métodos distintos cuyas partes suman exactamente lo recibido.
- **D3 — Cómo se guarda.** Tabla nueva `payment_method_parts` (aditiva) con una
  fila por parte, ligada al pago que divide. El campo `metodoPago` del pago queda
  con el método, o `MIXTO` cuando son dos partes. Los informes por método usan
  las partes cuando existen.
- **D4 — Un pago repartido entre varios paquetes.** Lo recibido se aplica a los
  paquetes en el orden de la venta (el primero hasta cubrirlo, luego el
  siguiente) y las partes en el mismo orden (primero se gasta el método 1). Así
  cada paquete tiene su propio pago y los totales por método cuadran.
- **D5 — Ventas › Cobros** (`/dashboard/ventas/cobros`; hereda el permiso
  "Clientes y ventas" de los colaboradores). Pestañas
  **Pendientes** (todo lo que tiene saldo) · **Vencidos** (saldo con el plazo
  vencido) · **Por revisar** (comprobantes) · **Historial** (pagos hechos). Desde
  cada fila se registra el pago o se revisa el comprobante. La pestaña *Pagos* sale
  de Clientes (`?tab=pagos` lleva al Historial).
- **D6 — La tarjeta del plan sin pestañas.** Termina en **Pagos**: los
  comprobantes por revisar arriba (Aprobar / Rechazar) y debajo el historial de
  pagos de ese plan. Las clases del plan ya no son una pestaña: se despliegan con
  "Ver clases (N)" bajo la barra de clases (para no perder ese historial).
- **D7 — Registrar pago con resumen.** Dos pasos: **1 Resumen** (plan, precio,
  pagado, saldo; cuánto paga y la fecha) → **2 Pago** (método o dos partes, con
  el total a recibir).
- **D8 — Egresos con método obligatorio.** Los nuevos egresos piden método (o dos
  partes). Los viejos quedan "sin método".

## Requisitos

- **R1 — Sin scroll vertical en filas de pestañas.** `ScrollHint` y las filas
  con `overflow-x-auto` llevan `overflow-y-hidden`.
- **R2 — Lógica común del pago dividido** (`src/lib/payment-breakdown.ts`, pura):
  validar partes (1 o 2, métodos distintos, mayores que cero, suman el total),
  resumen (`MIXTO`), equilibrar la otra parte al escribir una, repartir un pago
  entre varios cargos (D4) y desglosar un pago por método para informes.
- **R3 — Base de datos aditiva.** `payment_method_parts` y
  `expenses.metodoPago` (nullable).
- **R4 — API.** Donde hoy se recibe `metodoPago`, se acepta además `partes`
  (`[{ metodo, monto }]`, 1 o 2). Si llegan dos partes se guardan y `metodoPago`
  queda `MIXTO`. Aplica a: venta y renovación de paquetes, pago de un paquete,
  pago y abonos de mensualidades e inscripciones, egresos.
- **R5 — Venta de varios paquetes** (`POST /api/member-packages` con `items`).
  Todo en una transacción; si un paquete falla no se vende ninguno.
- **R6 — Asistentes paso a paso** con la tira de pasos de CliqCut (`ModalSteps`):
  vender paquetes (D1), registrar pago de un paquete (D7), renovar.
- **R7 — Academia.** Los modales de pago y de abono usan `PaymentBreakdown`.
- **R8 — Egresos e instructores.** El formulario de egreso pide método (D8); el
  pago a instructores usa el mismo componente y su egreso guarda el método.
  La venta de clase suelta al reservar (spec 007) también acepta dos partes.
- **R9 — Ventas › Cobros** (D5) con su entrada en el menú y su permiso.
- **R10 — Tarjeta del plan** (D6).
- **R11 — Contabilidad** reparte por método usando las partes.

## Criterios de aceptación

- Vender Body Combat + Rumba Fit a la vez deja dos planes; pagar $300.000 en
  efectivo $200.000 + Nequi $100.000 deja cada plan pagado y Contabilidad muestra
  $200.000 en efectivo y $100.000 en Nequi.
- Un pago en dos partes que no suma el total se rechaza (en la pantalla y en la API).
- La tarjeta del plan no tiene pestañas ni scroll vertical.
- Ventas › Cobros lista pendientes, vencidos, comprobantes por revisar y el historial.
- Pruebas unitarias (R2), funcionales (R4, R5, R11) y e2e (R6, R9, R10).

## Fuera de alcance

- Más de dos partes por pago.
- Cambiar el comprobante que envía el cliente (sigue siendo un solo método).

## Implementación

| Requisito | Dónde |
| --------- | ----- |
| R1 | `shared/scroll-hint.tsx`, `collaborators-hub.tsx`, selector de planes de la ficha |
| R2 | `lib/payment-breakdown.ts` (+ `.test.ts`) |
| R3 | `prisma/migrations/20261011120000_add_payment_method_parts` |
| R4 | `lib/payment-parts.ts`, `lib/member-packages.ts`, `lib/payment-installments.ts`, rutas de pago de academia y `api/expenses` |
| R5 | `sellMemberPackages` y `POST /api/member-packages` con `items` |
| R6 | `ui/modal-steps.tsx`, `ui/payment-breakdown.tsx`, `studio-sales-ui.tsx` |
| R7 | `ui/payment-method-modal.tsx`, `ui/payment-installment-modal.tsx` |
| R8 | `expenses-panel.tsx`, `instructor-payments-panel.tsx`, `lib/instructor-payments.ts`, `class-session-modal.tsx` |
| R9 | `app/dashboard/ventas/cobros`, `studio-collections-hub.tsx`, `nav-items.ts` |
| R10 | `studio-member-detail.tsx` (`PlanPayments`) |
| R11 | `api/accounting/overview` |

Pruebas: `src/lib/payment-breakdown.test.ts`, `tests/functional/payment-parts.test.ts`,
`tests/e2e/payments-wizard.e2e.test.ts` y los ajustes en `tests/e2e/studio.e2e.test.ts`.
