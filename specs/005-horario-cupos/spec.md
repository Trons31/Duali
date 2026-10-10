# 005 · Horario de clases y cupos

**Estado:** Implementada y probada (falta aplicar migraciones en producción) · **Fecha:** 2026-10-09 · **Propuesta:** [estudio/propuesta.md](../estudio/propuesta.md)

## Contexto

Para apartar cupos primero tiene que existir la clase concreta: "Body Combat,
lunes 13 de octubre, 6:00 p. m., 15 cupos". El estudio repite el mismo horario
cada semana, así que se define un **horario fijo** y de él salen las **clases**
de cada fecha.

## Referencia en CliqCut

- `SettingsClient.tsx` → "Horarios de atención" (bloques por día) y
  "Vista previa semanal" (lista lunes–domingo con chips de hora).
- Tarjetas `rounded-2xl border p-4 sm:p-6`, chips `rounded-lg` de color.

## Modelo (aditivo, tablas nuevas)

- `class_schedules` — horario fijo: id, clientId, disciplineId (tipo `CLASE`),
  diaSemana (1 = lunes … 7 = domingo), horaInicio (`"HH:mm"`), duracionMin,
  cupo, instructor?, activo, timestamps, deletedAt.
- `class_sessions` — una clase en una fecha: id, clientId, scheduleId,
  fecha (`DATE`), horaInicio, duracionMin, cupo (copiados del horario al crearla),
  cancelada, motivoCancelacion?, timestamps. Único (scheduleId, fecha).

Las clases **no se generan por adelantado**: la semana se calcula a partir de
los horarios fijos y solo se guarda una fila en `class_sessions` cuando esa
fecha necesita algo propio (cupo distinto, cancelación y, desde la spec 007,
reservas). Así cambiar un horario fijo afecta a las fechas futuras sin tocar las
que ya tienen datos.

Fechas y horas son "de pared" (hora del estudio, Colombia). "Hoy" se calcula en
`America/Bogota`, no con la hora del servidor.

## Requisitos

- **R1 — API horarios.** `GET/POST /api/class-schedules`,
  `PUT/DELETE /api/class-schedules/[id]`. `POST` acepta `dias[]` y crea un
  horario por día (ej. Body Combat lunes, miércoles y viernes 6 p. m. en un paso).
- **R2 — Reglas.** Solo disciplinas `CLASE` activas del negocio. Hora `HH:mm`
  válida, duración 15–240 min, cupo 1–500. Borrado lógico.
- **R3 — API semana.** `GET /api/class-sessions?from=YYYY-MM-DD&to=YYYY-MM-DD`
  (máx. 42 días) devuelve cada clase: fecha, hora, duración, cupo, disciplina,
  instructor, cancelada, `sessionId` si está guardada y `reservadas`
  (0 hasta la spec 007).
- **R4 — Ajustar una fecha.** `PUT /api/class-sessions` con
  `{ scheduleId, fecha, cupo?, cancelada?, motivoCancelacion? }` crea o actualiza
  la clase de esa fecha. Cancelar y reactivar es reversible.
- **R5 — Pantalla** `/dashboard/horario` (AGENDA → Horario de clases):
  - Pestaña **Semana**: navegación anterior / hoy / siguiente; 7 columnas en
    escritorio y lista por día en móvil. Cada clase es un chip con el color de la
    disciplina, hora, nombre y ocupación `0/15`. Las canceladas se ven tachadas.
  - Clic en una clase: detalle, cambiar el cupo solo de esa fecha, cancelar o
    reactivar con motivo.
  - Pestaña **Horarios fijos**: lista por día con editar / pausar / eliminar.
  - Botón **Nuevo horario**: disciplina, días, hora, duración, cupo, instructor.
- **R6 — Sidebar.** Nueva sección `AGENDA` (módulo Estudio) con "Horario de clases".

## Criterios de aceptación

- [x] Crear Body Combat L-M-V 6:00 p. m., 60 min, 15 cupos en un solo paso y verlo en la semana.
- [x] Cambiar el cupo del lunes 13 a 10 no cambia el de los demás lunes.
- [x] Cancelar la clase del lunes festivo la muestra tachada; reactivarla la devuelve.
- [x] Editar la hora del horario fijo mueve las fechas futuras sin datos propios.
- [x] La migración solo crea tablas nuevas.

## Pruebas

Unitarias: `src/lib/studio-time.test.ts` · Funcionales: `tests/functional/schedule.test.ts`.

## Fuera de alcance

- Reservas y ocupación real → spec 007.
- Avisar a las reservadas cuando se cancela → specs 007 y 011.
- Clases con fecha única que no se repiten (taller especial) → futura.
