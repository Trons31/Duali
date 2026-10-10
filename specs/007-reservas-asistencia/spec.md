# 007 · Reservas, asistencia y clase suelta

**Estado:** Implementada y probada (falta aplicar migraciones en producción) · **Fecha:** 2026-10-09 · **Propuesta:** [estudio/propuesta.md](../estudio/propuesta.md)

## Contexto

Con horario (005) y paquetes vendidos (006) ya se puede **apartar cupo**:
reservar a un cliente en una clase concreta, descontando de su paquete.
Decisión D2: la clase se descuenta **al reservar**; si cancela antes del plazo
se devuelve, si no asiste se pierde.

## Modelo (aditivo)

- `bookings` (tabla nueva): id, clientId, sessionId, memberId, memberPackageId,
  estado (`RESERVADA` | `ASISTIO` | `NO_ASISTIO` | `CANCELADA`), origen
  (`PANEL` | `PUBLICO`), canceladaAt?, claseDevuelta (bool), timestamps.
  Único (sessionId, memberId): reservar de nuevo a alguien que canceló reactiva
  su fila.
- `clients.horasCancelacion INTEGER NOT NULL DEFAULT 2` (columna nueva):
  plazo para cancelar y recuperar la clase.

## Requisitos

- **R1 — Reservar** `POST /api/bookings`
  `{ scheduleId, fecha, memberId, memberPackageId?, venta?: { packageId, precio?, pago? } }`.
  En una transacción que **bloquea la clase** (`SELECT … FOR UPDATE`):
  1. La clase existe, no está cancelada y su fecha no es pasada.
  2. Hay cupo: reservas no canceladas < cupo.
  3. Paquete: el indicado o, si no se indica, el vigente que **vence primero**
     y sirve para la disciplina (la misma, o un combo que la incluya), con la
     fecha de la clase dentro de su vigencia y clases disponibles.
  4. Si no hay paquete y viene `venta`, se vende ahí mismo (clase suelta u otro
     paquete, con pago opcional — misma lógica de la 006) y se usa.
  5. Se descuenta 1 clase con un `UPDATE` condicionado (`clasesUsadas < clases`).
- **R2 — Cancelar** `PUT /api/bookings/[id]` `{ cancelar: true, devolverClase? }`.
  Devuelve la clase si faltan al menos `horasCancelacion` horas para el inicio
  (hora de Bogotá) o si el dueño marca `devolverClase` (excepción manual).
- **R3 — Asistencia** `PUT /api/bookings/[id]` `{ estado: "ASISTIO" | "NO_ASISTIO" | "RESERVADA" }`.
  No cambia el saldo de clases (ya se descontó al reservar).
- **R4 — Integridad con 005 y 006.**
  - Cancelar una clase cancela sus reservas **y devuelve la clase a todos**.
  - El cupo de una fecha no puede bajar de las reservas que ya tiene.
  - No se borra un horario fijo con reservas futuras.
  - No se anula una venta con reservas futuras activas.
  - `reservadas` en la semana cuenta las reservas no canceladas.
- **R5 — Pantalla.** En el detalle de una clase (Horario de clases):
  lista de reservados con su paquete, botones **Asistió / No asistió**, cancelar;
  **Reservar cupo**: buscar cliente → muestra el paquete que se usará o, si no
  tiene, ofrece **vender clase suelta** (u otro paquete) y reservar en un paso.
- **R6 — Ficha del cliente:** sección **Próximas reservas** con cancelar.
- **R7 — Ajustes:** tarjeta **Reservas** (solo con módulo Estudio): horas de
  anticipación para cancelar y recuperar la clase.

## Criterios de aceptación

- [x] Reservar a alguien con Básico (4) lo deja en 3 restantes y la clase en 1/15.
- [x] Reservar en una clase llena responde "Sin cupos".
- [x] Dos reservas simultáneas por el último cupo: solo una entra.
- [x] Mix Studio sirve para reservar Jump Power; Básico Body Combat no.
- [x] Cliente sin paquete: "Vender clase suelta y reservar" crea la venta y la reserva.
- [x] Cancelar con más de 2 h de anticipación devuelve la clase; con menos no (salvo excepción).
- [x] Cancelar la clase del festivo devuelve la clase a todas sus reservas.
- [x] La migración solo crea una tabla, dos enums y una columna con `DEFAULT`.

## Pruebas

Unitarias: plazo de cancelación en `studio-time.test.ts` · Funcionales: `tests/functional/bookings.test.ts` (incluye 3 reservas simultáneas por el último cupo).

## Fuera de alcance

- Reserva desde la página pública → spec 009 (usará esta misma lógica con origen `PUBLICO`).
- Lista de espera y avisos → spec 011.
