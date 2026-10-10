# 006 · Clientes del estudio y venta de paquetes

**Estado:** Implementada y probada (falta aplicar migraciones en producción) · **Fecha:** 2026-10-09 · **Propuesta:** [estudio/propuesta.md](../estudio/propuesta.md)

## Contexto

Con el catálogo listo (004), el estudio necesita vender: "Laura compró Básico de
Body Combat, $55.000, pagó $30.000 por Nequi y debe $25.000". Decisiones
aplicadas: D1 revisada (tabla propia de clientes, identificados por celular),
D3 (vigencia de 30 días desde el inicio), D4 (las clases no usadas se pierden;
el dueño puede extender la fecha), D5 (se puede deber parte o todo).

## Modelo (aditivo, tablas nuevas)

- `studio_members` — clientes del estudio: id, clientId, nombre, apellido?,
  celular (solo dígitos, sin 57), email?, fechaNacimiento (`DATE`)?, notas?,
  studentId? (enlace opcional a la ficha de la Academia), timestamps, deletedAt.
  Único (clientId, celular): si se "crea" un celular borrado, se restaura.
- `member_packages` — paquete vendido: id, clientId, memberId, packageId,
  disciplineId, nombre, clases y precio **copiados al vender** (cambiar el catálogo
  no altera ventas hechas), clasesUsadas (0), pagado (0), inicio y vence (`DATE`),
  anuladoAt?, motivoAnulacion?, notas?, timestamps.
- `member_package_payments` — pagos y abonos: id, clientId, memberPackageId,
  monto, metodoPago, fecha, notas?, anuladoAt?, createdAt.

**Estado calculado, no guardado** (no hace falta cron): `ANULADO` si tiene
anuladoAt; `VENCIDO` si vence < hoy; `AGOTADO` si usó todas las clases; si no,
`ACTIVO`. Avisos: "por vencer" (≤ 3 días) y "pocas clases" (≤ 2 restantes).
Pago: `PAGADO` / `PARCIAL` / `PENDIENTE` según pagado vs. precio.

## Requisitos

- **R1 — API clientes.** `GET /api/studio-members?q=` (con resumen de paquetes
  vigentes y saldo), `POST`, `GET/PUT/DELETE /api/studio-members/[id]`.
  Celular obligatorio y único por negocio (409 con el nombre de quien lo tiene).
  No se borra un cliente con paquetes vigentes (409).
- **R2 — Vender.** `POST /api/member-packages`
  `{ memberId, packageId, inicio?, precio?, pago?: { monto, metodoPago } }`.
  `inicio` por defecto hoy (Bogotá); `vence = inicio + vigenciaDias − 1`;
  `precio` por defecto el del catálogo (se puede dar descuento). El pago inicial
  es opcional y no puede superar el precio. Todo en una transacción.
- **R3 — Gestionar una venta.** `PUT /api/member-packages/[id]`:
  `{ vence }` para extender (no antes del inicio) o
  `{ anular: true, motivo }` para anular (sus pagos dejan de contar como ingreso).
- **R4 — Pagos.** `POST /api/member-packages/[id]/payments`
  `{ monto, metodoPago, fecha?, notas? }` (monto ≤ saldo) y
  `DELETE /api/member-packages/[id]/payments/[paymentId]` (anula, no borra).
- **R5 — Contabilidad.** Los pagos no anulados de ventas no anuladas suman como
  ingreso: tipo de movimiento **Paquete** en el detalle mensual, en métodos de
  pago y en el resumen (`ingresosPaquetes` dentro de `ingresosTotales` y de
  "recibido este mes"). Lo de la Academia no cambia.
- **R6 — Pantallas** (sección VENTAS, módulo Estudio):
  - **Clientes** `/dashboard/clientes`: buscador, tarjetas con el paquete vigente
    (`3 de 4 clases · vence 12 nov`) y saldo; "Nuevo cliente".
  - **Ficha** `/dashboard/clientes/[id]`: datos y WhatsApp, "Vender paquete",
    paquetes con barra de clases usadas, estado, pagos; registrar pago, extender
    vencimiento, anular.
  - **Paquetes vendidos** `/dashboard/ventas`: todas las ventas con filtros
    (Vigentes, Por vencer, Con saldo, Terminados, Anulados) y totales.
- **R7 — Vender en un paso** desde la ficha: disciplina → paquete (con precio) →
  inicio → precio final → pago ahora (monto + método).

## Criterios de aceptación

- [x] Vender Básico Body Combat a un cliente con pago parcial deja saldo y aparece "Con saldo".
- [x] Cambiar después el precio del catálogo no cambia esa venta.
- [x] Un abono de más del saldo se rechaza.
- [x] Anular la venta saca sus pagos de Contabilidad.
- [x] Un paquete con `vence` ayer se ve "Vencido" sin ningún proceso nocturno.
- [x] La migración solo crea tablas nuevas.

## Pruebas

Unitarias: `src/lib/member-packages.test.ts` · Funcionales: `tests/functional/sales.test.ts` (incluye Contabilidad y abonos simultáneos).

## Fuera de alcance

- Descontar clases al reservar → spec 007 (aquí `clasesUsadas` queda en 0).
- Comprobante con foto → spec 009 (depende de Cloudinary).
- Avisos automáticos de vencimiento → spec 011.
