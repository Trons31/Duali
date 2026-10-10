# 009 · Reserva pública de cupos

**Estado:** Implementada y probada (falta aplicar migraciones en producción) · **Fecha:** 2026-10-09 · **Propuesta:** [estudio/propuesta.md](../estudio/propuesta.md)

## Contexto

La clienta entra a `/s/{slug}`, elige una clase y aparta su cupo sin llamar al
estudio. Decisiones: D5 (puede reservar sin haber pagado: queda debiendo y el
dueño confirma el pago) y D6 (se identifica con celular y nombre, sin contraseña).

## Referencia en CliqCut

`BookingWizard`: pasos con barra de progreso ("2 / 3 · Tus datos"), botón Atrás,
tarjetas seleccionables, confirmación final.

## Seguridad (sin contraseña)

- Si el celular ya es de un cliente, **el nombre debe coincidir** (primer nombre,
  sin tildes ni mayúsculas) para reservar con su paquete. Si no coincide: 409
  "Ese celular está registrado con otro nombre. Escríbele al estudio."
- No existe "buscar mis reservas por celular" (permitiría ver las de otra persona).
  Cada reserva web recibe un **enlace privado** con token aleatorio para verla o
  cancelarla.
- Las respuestas nunca devuelven datos del cliente que no haya escrito quien reserva.

## Modelo (aditivo)

`bookings` gana `accessToken TEXT NULL UNIQUE` (solo reservas web).

## Requisitos

- **R1 — Reservar** `POST /api/public/studios/[slug]/bookings` (sin sesión)
  `{ scheduleId, fecha, celular, nombre, apellido?, packageId? }`:
  - Página publicada y módulo Estudio activo; clase entre hoy y 14 días; si es hoy,
    que no haya empezado.
  - Cliente: si el celular no existe se crea; si existe, se valida el nombre.
  - Con paquete vigente que sirva → reserva y descuenta (misma lógica de la 007,
    origen `PUBLICO`).
  - Sin paquete y sin `packageId` → **200** `{ estado: "NECESITA_PAQUETE", opciones }`
    con los paquetes `activo && visiblePublico` que sirven para esa clase.
  - Con `packageId` → se vende **sin pago** (queda debiendo, D5) y se reserva.
  - Respuesta 201: clase, paquete usado, saldo por pagar, métodos de pago y
    `enlace` privado.
- **R2 — Ver y cancelar** `GET/PUT /api/public/bookings/[token]`: muestra la
  reserva; `{ cancelar: true }` aplica el plazo del negocio (sin excepción manual).
- **R3 — Asistente** en `/s/[slug]/reservar`: 1) Clase (días + clases con cupos),
  2) Tus datos, 3) Paquete (solo si hace falta), 4) Confirmación con cómo pagar,
  botón de WhatsApp con el mensaje armado y el enlace para gestionar la reserva.
- **R4 — Página de la reserva** `/s/[slug]/reserva/[token]`: estado, clase,
  cancelar (con aviso de si recupera o no la clase).
- **R5 — Panel:** las reservas web se ven con "reservó en línea" (ya existe) y las
  ventas sin pagar aparecen en "Con saldo".

## Criterios de aceptación

- [x] Clienta nueva sin paquete: elige "Individual", reserva y queda debiendo $15.000.
- [x] Clienta con Básico vigente reserva y le quedan 3 clases.
- [x] Mismo celular con otro nombre: 409 y no se descuenta nada.
- [x] Página sin publicar: 404 al reservar.
- [x] Paquete oculto en la página: no se puede vender por la web.
- [x] El enlace privado permite cancelar; un token inventado da 404.
- [x] Clase de hoy que ya empezó: no se puede reservar por la web.
- [x] La migración solo agrega una columna NULL con índice único.

## Pruebas

Funcionales: `tests/functional/public.test.ts` · E2E: reserva completa de una visitante por HTTP.

## Fuera de alcance

- Subir foto del comprobante (Cloudinary, spec 010).
- Código de verificación por WhatsApp.
- Límite de peticiones por IP (anotado como mejora).
