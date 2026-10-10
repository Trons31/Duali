# 020 · Renovaciones, pagos y vencimientos

**Estado:** Propuesta — pendiente de aprobación · **Fecha:** 2026-10-09

## Contexto

Revisando el demo, la dueña no encuentra respuesta a preguntas del día a día:

1. **¿Cómo renuevo el plan de Valentina?** Un plan dura los días del paquete
   (30 por defecto, `packages.vigenciaDias`). Al vencer no hay botón "Renovar": hay
   que entrar a la ficha y vender el paquete otra vez, y nada une la venta nueva con
   la anterior.
2. **¿Cuándo me tiene que pagar lo que debe?** Una venta con saldo dice "Debe
   $60.000", pero no tiene fecha límite. No se sabe si el saldo ya está atrasado ni
   por cuántos días.
3. **¿Dónde veo los pagos?** Los abonos están dentro de cada tarjeta de la ficha
   (la línea "9 de oct de 2026 · Efectivo $60.000"), sin título y sin una vista que
   junte los pagos de todos los clientes. Academia sí tiene Cobros › Pagos.
4. **¿Quién se me fue?** Un plan vencido desaparece de lo que importa hoy; no hay
   una lista de "vencidos sin renovar" ni cuántos días lleva cada uno.
5. **¿Cómo le aviso?** Avisos ya arma los mensajes de WhatsApp de "por vencer" y
   "saldo pendiente" (spec 011), pero no cubre un plan ya vencido ni un saldo
   atrasado, y la ficha no tiene un botón para avisar.

## Referencias

- **CliqCut** `components/owner/PaymentsClient.tsx`: historial de pagos con
  pestañas, filtros por método y mes y totales arriba.
- **Duali Academia** Cobros › Pagos / Pendientes / Vencidos: la misma trazabilidad
  para mensualidades ("vencido hace N días").
- **Duali spec 011** (`src/lib/studio-messages.ts`, `studio-reminders.ts`): mensajes
  de WhatsApp listos y marca de "enviado".

## Decisiones (recomendadas)

- **D1 — Renovar es vender el mismo paquete otra vez, encadenado a la venta
  anterior.** Si el plan sigue vigente, el nuevo empieza el día siguiente a su
  vencimiento (no se pierden días). Si ya venció, empieza hoy. Las clases que no
  usó **no se pasan** al plan nuevo, como hoy. El precio se toma del paquete
  actual y se puede editar.
- **D2 — Fecha límite del saldo.** Toda venta que queda debiendo tiene un
  "paga el resto antes del…". Por defecto es la fecha de inicio más el **plazo para
  pagar** de Ajustes (7 días), y se puede cambiar al vender. Las ventas viejas sin
  fecha usan esa misma regla.
- **D3 — Pestaña "Pagos" en Clientes** (Clientes · Planes · Clases sueltas ·
  **Pagos**): todos los pagos del estudio. En la ficha, cada venta muestra sus
  abonos con título. No se agrega otra entrada al menú.
- **D4 — Avisar es por WhatsApp con el mensaje listo**, como en spec 011 (un toque
  abre WhatsApp con el texto; la dueña lo envía). El envío automático sigue fuera
  de alcance porque requiere la API de WhatsApp Business, que tiene costo.

## Modelo (aditivo)

- `member_packages.fechaLimitePago DATE NULL` (D2). Nula = se calcula con la regla.
- `member_packages.renovacionDeId TEXT NULL`, la venta que esta renueva (D1).
- `clients.diasPlazoSaldo INT NOT NULL DEFAULT 7` (D2).

Nada se renombra ni se borra.

## Requisitos

### A. Estado del plan y del saldo

- **R1 — Estado de vigencia con días**, igual en las tarjetas de Clientes y Planes
  y en la ficha:

  | Caso | Texto |
  | --- | --- |
  | Vigente, más de 3 días | `vence 7 de nov` |
  | Por vencer (≤ 3 días) | `Vence en 2 días` (ámbar) |
  | Vencido, sin renovar | `Venció hace 5 días` (rojo) |
  | Renovado | `Renovado · sigue Plus hasta 7 dic` (gris) |
  | Agotado | `Usó sus 8 clases` |

- **R2 — Estado del saldo con fecha:**

  | Caso | Texto |
  | --- | --- |
  | Pagado | `Pagado` |
  | Debe, en plazo | `Debe $60.000 · paga antes del 16 oct` |
  | Debe, atrasado | `Saldo vencido hace 3 días · $60.000` (rojo) |

### B. Renovar (D1)

- **R3 — Botón "Renovar"** en la tarjeta del plan cuando está por vencer, vencido o
  agotado, y en la ficha. Abre el modal de venta con el mismo paquete, la fecha de
  inicio según D1 y "Pagó ahora" opcional:

  ```
  ┌ Renovar plan ───────────────────────────── ✕ ┐
  │ Valentina Ruiz · Plus Mix Studio (8 clases)   │
  │ Empieza  [ 8 nov 2026 ]   Vence 7 dic         │
  │ Precio   [ $ 120.000 ]                        │
  │ ☐ Pagó ahora   Paga el resto antes del [15 nov]│
  │ Le quedan 2 clases sin usar: no se pasan.     │
  │ [ Cancelar ]               [ Renovar $120.000 ]│
  └───────────────────────────────────────────────┘
  ```

- **R4 — Trazabilidad de la renovación:** la venta anterior muestra "Renovado" y la
  nueva "Renovación de Plus (9 oct – 7 nov)". Anular la renovación deja la anterior
  como estaba.

### C. Pagos (D3)

- **R5 — Pestaña Pagos** en Clientes: lista por fecha (más reciente arriba) de todos
  los abonos de ventas del estudio.

  ```
  Cobrado este mes $480.000   Por cobrar $135.000   Saldos vencidos 2
  [ Buscar cliente ]  (Este mes ▾)  (Todos los métodos ▾)
  Hoy
  ┌──────────────────────────────────────────────┐
  │ Valentina Ruiz · Plus Mix Studio              │
  │ Bancolombia · abono 2 de 2      $ 60.000   ›  │
  └──────────────────────────────────────────────┘
  │ Camila Torres · Clase suelta Rumba            │
  │ Efectivo                         $ 15.000  ›  │
  │ ~~Nequi · anulado: registrado por error~~     │
  ```

  Los pagos anulados se ven tachados con su motivo. Tocar uno lleva a la ficha.
- **R6 — Abonos en la ficha:** cada venta muestra "Pagos (2)" con fecha, método y
  monto, el total pagado y lo que falta, y "abono 1 de 2" cuando hubo más de un
  pago.

### D. Vencidos y avisos (D4)

- **R7 — Filtro "Vencidos sin renovar"** en la pestaña Clientes: quienes tuvieron
  un plan que venció hace 60 días o menos y no tienen otro vigente, ordenados por
  "venció hace N días".
- **R8 — Avisos** suma dos secciones a las de spec 011: **Planes vencidos sin
  renovar** y **Saldos vencidos** (con los días de atraso). Cada fila tiene su
  botón de WhatsApp y la marca de enviado, como las demás.
- **R9 — Botón "Avisar por WhatsApp"** en la ficha, que elige el mensaje según el
  caso: por vencer, vencido sin renovar, saldo pendiente o saldo vencido. Si el
  estudio tiene métodos de pago, el mensaje de saldo los incluye.
- **R10 — Inicio › Para atender** cuenta los saldos vencidos y los planes vencidos
  esta semana sin renovar.
- **R11 — Ajustes › Reservas:** "Plazo para pagar el saldo: [7] días".

## API

- `POST /api/member-packages/[id]/renew` `{ precio?, inicio?, pago?, fechaLimitePago? }` (R3).
- `POST /api/member-packages` acepta `fechaLimitePago` (D2).
- `GET /api/member-packages/payments?desde&hasta&metodo&q` (R5).
- `GET /api/studio-reminders` suma `vencidos` y `saldosVencidos` (R8).

## Criterios de aceptación

- [ ] Un plan vencido dice "Venció hace N días" y uno por vencer "Vence en N días".
- [ ] Renovar un plan vigente empieza al día siguiente de su vencimiento; uno vencido, hoy.
- [ ] La venta anterior queda "Renovado" y la nueva dice de cuál viene.
- [ ] Un saldo después de su fecha límite dice "Saldo vencido hace N días".
- [ ] La pestaña Pagos lista todos los abonos con totales del mes; los anulados, tachados.
- [ ] Avisos muestra vencidos sin renovar y saldos vencidos, con WhatsApp.
- [ ] Bancolombia aparece como método de pago (hecho, ver Notas).
- [ ] La migración solo agrega columnas nulas o con default.

## Fases de implementación

1. **Estados con días y fecha límite** (R1, R2, R11 + migración).
2. **Renovar** (R3, R4).
3. **Pagos** (R5, R6).
4. **Vencidos y avisos** (R7–R10).

## Pruebas

Unitarias (fecha de inicio de la renovación, fecha límite y días de atraso, textos
de estado), funcionales (renovar vigente y vencido, anular una renovación, listado
de pagos con filtros y aislamiento por negocio, avisos nuevos) y de punta a punta
(pestaña Pagos, filtro de vencidos, botón Renovar).

## Fuera de alcance

- Envío automático de WhatsApp (API de WhatsApp Business).
- Cobro automático o enlace de pago (pasarela).
- Renovación automática al vencer.
- Pasar las clases sin usar al plan nuevo.

## Notas

- **Ya hecho, sin spec aparte:** **Bancolombia** como método de pago (Estudio y
  Academia, en el orden de CliqCut: Efectivo, Nequi, Bancolombia, Transferencia,
  Otro). `metodoPago` ya es texto en la base, así que no hubo migración.
- **Instructor:** es opcional y se define en **Horario › Horarios fijos** al crear o
  editar un horario. En el detalle de la clase ahora dice "Sin asignar" en vez de "—".
