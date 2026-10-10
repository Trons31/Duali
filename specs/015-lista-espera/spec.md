# 015 · Lista de espera

**Estado:** Implementada y probada · **Fecha:** 2026-10-09

## Contexto

Cuando una clase se llena, la página pública la muestra como "Lleno" y no deja
hacer nada: quien quería ir se va, y si alguien cancela el cupo queda vacío.
Pendiente anotado al cerrar la 014.

## Objetivo de experiencia

La clienta que encuentra la clase llena se anota en la lista de espera con los
mismos datos de una reserva. Si alguien cancela a tiempo, el cupo pasa solo a la
primera de la lista y la dueña recibe un aviso para escribirle por WhatsApp.

## Decisiones

- **W1 — Asignación automática solo a tiempo.** El cupo liberado pasa solo a la
  primera de la lista mientras la clase esté **antes del plazo de cancelación**
  del estudio (`horasCancelacion`). Así quien recibe el cupo todavía puede
  cancelarlo y recuperar la clase. Pasado el plazo no se asigna nada solo: la
  dueña recibe "Se liberó un cupo" y decide con **Dar cupo** en el panel.
- **W2 — Mismas reglas de una reserva.** Al asignar se descuenta de un plan
  vigente; si no tiene, se vende sin pago el plan que eligió al anotarse (D5).
  Si ya no tiene ninguno válido, se salta y sigue la siguiente.
- **W3 — Enlace privado propio** (`/s/{slug}/espera/{token}`): muestra su puesto
  y permite salir de la lista. Cuando recibe cupo, ese enlace lleva a la página
  de la reserva.
- **W4 — Tope de 10 personas en espera por clase** (evita abuso).
- Quien reserva por otro camino (panel o web) sale de la lista de esa clase.

## Modelo (aditivo)

- Enum `WaitlistStatus` (`EN_ESPERA` | `ASIGNADA` | `SALIO`).
- Tabla `waitlist_entries`: id, clientId, sessionId, memberId, packageId?
  (plan elegido para comprar), accessToken (único), estado, bookingId?,
  createdAt (orden de llegada), updatedAt. Única por (sessionId, memberId).
- `StudioMessageType` gana `CUPO_LISTA_ESPERA` (valor nuevo del enum).

## Requisitos

- **R1 — Anotarse** `POST /api/public/studios/[slug]/waitlist` (sin sesión), con
  el mismo cuerpo y validaciones de la reserva web (spec 009): la clase debe
  estar llena y no cancelada; sin plan vigente y sin `packageId` responde
  `NECESITA_PAQUETE`. 409 si ya tiene cupo, si ya está en la lista o si la
  lista está llena. Respuesta 201 `{ estado: "EN_ESPERA", accessToken, posicion }`.
- **R2 — Ver y salir** `GET/PUT /api/public/waitlist/[token]` (`{ salir: true }`).
- **R3 — Asignación automática** al liberarse cupo (cancelar una reserva desde
  el panel o la web, subir el cupo o reactivar la clase), según W1 y W2.
  Push a la dueña: "Laura tomó un cupo de la lista de espera" (abre Avisos).
- **R4 — Panel:** en el detalle de la clase, sección **Lista de espera** con
  puesto, nombre y plan; **Dar cupo** (si hay cupo libre, sin importar el plazo)
  y **Quitar**. API `GET /api/waitlist?scheduleId&fecha`,
  `POST /api/waitlist/[id]/assign`, `DELETE /api/waitlist/[id]`.
- **R5 — Avisos:** sección **Cupos de la lista de espera** con el mensaje de
  WhatsApp listo ("¡Se liberó un cupo!…" con el enlace de su reserva) para las
  asignadas de clases que aún no pasan.
- **R6 — Página pública:** las clases llenas dicen "Lleno · lista de espera" y
  se pueden elegir; el asistente cambia los textos ("Unirme a la lista de
  espera") y termina con su puesto y su enlace.

## Criterios de aceptación

- [x] Clase con cupo: no deja anotarse (hay que reservar).
- [x] Clase llena: se anota sin descontar ni vender nada y recibe su puesto.
- [x] Al cancelar a tiempo una reserva, la primera de la lista queda reservada
      (con su plan o con el plan elegido, debiendo) y sale de la lista.
- [x] Pasado el plazo de cancelación no se asigna solo; **Dar cupo** sí asigna.
- [x] Si la primera ya no tiene plan válido, el cupo pasa a la siguiente.
- [x] El enlace de espera permite salir; después no recibe cupo.
- [x] Undécima persona en la lista: 409.
- [x] Otro negocio no ve ni maneja la lista.
- [x] La migración solo crea un enum, una tabla y agrega un valor a un enum.

## Fuera de alcance

- Avisarle a la clienta sin pasar por la dueña (SMS o WhatsApp automático).
- Lista de espera creada desde el panel.

## Pruebas

Funcionales: `tests/functional/waitlist.test.ts` · Unitarias: mensaje en
`src/lib/studio-messages.test.ts` · E2E: clase llena → anotarse → cancelación →
el enlace de espera lleva a la reserva; Avisos muestra el cupo asignado.
