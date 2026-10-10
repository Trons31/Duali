# 011 · Notificaciones del estudio

**Estado:** Implementada y probada (falta aplicar migraciones en producción) · **Fecha:** 2026-10-09 · **Propuesta:** [estudio/propuesta.md](../estudio/propuesta.md)

## Contexto

Duali ya tiene (Academia):
- **Push a la dueña** con cola y reintentos (`queueNotification` → outbox →
  web push / Expo), con `dedupKey` para no repetir y `data.href` para abrir la
  pantalla correcta al tocarla.
- **Avisos a alumnos por WhatsApp** que la dueña envía con un toque (no hay API
  de WhatsApp: se abre `wa.me` con el mensaje armado).
- Un cron externo (cron-job.org) que llama `GET /api/cron/payment-reminders`.

El estudio necesita lo mismo para clases, paquetes y saldos.

## Requisitos

### Push a la dueña (automáticos)

- **R1 — Reserva web:** al reservar desde la página pública, push
  "Valentina apartó cupo · Body Combat lun 13, 6:00 p. m." (+ "debe $15.000" si
  aplica). Abre la ficha del cliente.
- **R2 — Cancelación web:** push "Valentina canceló Body Combat lun 13" (indica
  si recuperó la clase).
- **R3 — Resumen del día** (una vez al día, desde las 6:00 a. m. de Bogotá):
  "Hoy: 5 clases y 38 reservas · 3 paquetes por vencer · $120.000 por cobrar".
  Corre dentro del cron existente (sin configurar nada nuevo) y se deduplica por
  negocio y fecha. Si falla, no afecta los recordatorios de la Academia.
- Todos son best-effort: si encolar falla, la reserva o cancelación igual queda.

### Avisos a clientes por WhatsApp (la dueña los envía)

- **R4 — Pantalla** `AGENDA → Avisos` (`/dashboard/avisos`) con tres listas:
  - **Clases de mañana:** cada reserva con botón "Recordar por WhatsApp".
  - **Paquetes por vencer o con pocas clases:** "Te quedan 2 clases…".
  - **Saldos pendientes:** con los métodos de pago del negocio.
- **R5 — Clase cancelada:** al cancelar una clase con reservas, el detalle de la
  clase ofrece avisar a cada persona por WhatsApp.
- **R6 — Enviados:** al tocar el botón se registra el envío (tabla
  `studio_messages`) y la fila queda marcada "Enviado"; no se duplica en la lista
  del mismo día/clase. Se puede volver a enviar.
- Mensajes con el nombre del negocio, fecha y hora en formato local, y el enlace
  a la página pública si está publicada.

## Modelo (aditivo)

`studio_messages` (tabla nueva): id, clientId, memberId, tipo
(`RECORDATORIO_CLASE` | `PAQUETE_POR_VENCER` | `SALDO` | `CLASE_CANCELADA`),
refKey (reserva, venta o clase+fecha), sentAt, createdAt.
Único (clientId, tipo, refKey).

## Criterios de aceptación

- [x] Una reserva web encola un push a la dueña con `href` a la ficha del cliente.
- [x] Una reserva hecha desde el panel no genera push (la dueña ya lo sabe).
- [x] El resumen del día se encola una sola vez aunque el cron corra 100 veces.
- [x] Antes de las 6:00 a. m. de Bogotá no se encola el resumen.
- [x] Avisos lista las reservas de mañana, los paquetes por vencer y los saldos, solo del negocio.
- [x] Marcar un aviso como enviado lo muestra "Enviado" y no crea duplicados.
- [x] El texto de WhatsApp incluye negocio, clase, fecha y hora correctas.
- [x] La migración solo crea una tabla, un enum y sus índices.

## Pruebas

- Unitarias: `src/lib/studio-messages.test.ts` (textos, fechas y horas, montos, enlace de WhatsApp, resumen).
- Funcionales: `tests/functional/notifications.test.ts` (push por reserva y cancelación web, ninguno por reserva
  del panel, resumen una sola vez y no antes de las 6:00, cron con y sin secreto, avisos por negocio, enviados sin duplicar,
  clase cancelada).
- E2E: pantalla Avisos con datos reales y menú.

## Fuera de alcance

- Envío automático por WhatsApp (requiere la API de WhatsApp Business; costo aparte).
- Lista de espera cuando se libera un cupo.
- Push a los clientes del estudio (no tienen app).
