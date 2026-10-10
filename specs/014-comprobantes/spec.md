# 014 · Comprobante de pago en la reserva web

**Estado:** Implementada y probada · **Fecha:** 2026-10-09

## Contexto

Quien reserva desde la página sin plan vigente queda debiendo (D5) y hoy manda
el comprobante por WhatsApp; la dueña lo busca en el chat y registra el pago a
mano. Pendiente de las specs 009 y 010.

## Objetivo de experiencia

La clienta adjunta la foto del comprobante en la misma pantalla de su reserva;
la dueña la ve en su panel y con un toque la aprueba y queda el pago registrado.

## Diseño

- **Subida como Nubi (spec 010):** elegir la foto solo muestra la vista previa;
  se sube al tocar **Enviar comprobante**.
- **Sin sesión, pero no anónima:** la firma de subida solo se entrega con el
  enlace privado de una reserva (token) que tenga saldo pendiente. La carpeta la
  decide el servidor: `duali/negocios/{idNegocio}/imagenes/comprobantes`.
- Máximo **3 comprobantes por revisar** por venta (evita abuso).

## Modelo (aditivo)

`payment_receipts` (tabla nueva): id, clientId, memberPackageId, bookingId?,
url, publicId, estado (`POR_REVISAR` | `APROBADO` | `RECHAZADO`), paymentId?,
motivoRechazo?, createdAt, reviewedAt?.

## Requisitos

- **R1 — Firma pública** `POST /api/public/bookings/[token]/receipt-signature`.
- **R2 — Adjuntar** `POST /api/public/bookings/[token]/receipts { url, publicId }`:
  valida carpeta del negocio + uso `comprobantes`, saldo > 0 y el tope de 3.
  Push a la dueña "Laura envió un comprobante" (abre su ficha).
- **R3 — Revisar** (dueña):
  - `GET /api/payment-receipts?estado=POR_REVISAR` (con cliente, venta y saldo).
  - `POST /api/payment-receipts/[id]/approve { monto, metodoPago }` registra el
    pago con la misma regla de la 006 (no supera el saldo) y lo enlaza.
  - `POST /api/payment-receipts/[id]/reject { motivo? }`; la foto se borra de Cloudinary.
- **R4 — Página pública:** en la confirmación y en la página de la reserva, si
  hay saldo: **Adjuntar comprobante** (vista previa → Enviar). Muestra el estado
  ("En revisión", "Aprobado", "Rechazado: motivo").
- **R5 — Panel:** sección **Comprobantes por revisar** en Avisos (foto, cliente,
  saldo, Aprobar / Rechazar) y en la ficha del cliente; el Inicio lo cuenta en
  "Para atender".

## Criterios de aceptación

- [x] Sin token válido o sin saldo no se firma ni se adjunta.
- [x] Un archivo de otra carpeta o de otro negocio se rechaza.
- [x] El cuarto comprobante por revisar de una venta se rechaza.
- [x] Aprobar registra el pago, baja el saldo y marca el comprobante aprobado; no supera el saldo.
- [x] Rechazar borra la foto de Cloudinary y la clienta ve el motivo.
- [x] Elegir la foto sin enviar no sube nada.
- [x] La migración solo crea una tabla y un enum.

## Fuera de alcance

- Leer el monto del comprobante automáticamente (OCR).
