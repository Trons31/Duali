# 002 · Módulos del negocio y sidebar

**Estado:** Implementada y probada (falta aplicar migraciones en producción) · **Fecha:** 2026-10-09 · **Propuesta:** [estudio/propuesta.md](../estudio/propuesta.md)

## Contexto

Duali va a soportar dos formas de negocio: **Academia** (grupos + mensualidades,
lo de hoy) y **Estudio** (disciplinas, paquetes de clases, cupos). Cada negocio
elige qué usa, igual que en CliqCut se activa "Venta de productos".

## Referencia en CliqCut

- `SettingsClient.tsx` → `ServiceModeSection` / `ModeOption`: tarjeta con
  opciones seleccionables que se guardan al hacer clic.
- `Sidebar.tsx`: secciones armadas según la configuración del negocio.

## Requisitos

- **R1 — Datos (aditivo).** `clients` gana `moduloAcademia BOOLEAN NOT NULL DEFAULT true`
  y `moduloEstudio BOOLEAN NOT NULL DEFAULT false`. Los negocios existentes quedan
  exactamente como hoy (solo Academia).
- **R2 — API.** `GET /api/client/profile` devuelve ambos campos; `PUT` los acepta.
  No se permite dejar los dos en `false` (422).
- **R3 — Ajustes.** Primera tarjeta: **Tipo de negocio** con tres opciones
  (`Academia`, `Estudio`, `Academia + Estudio`). Guarda al hacer clic, muestra
  "Guardando…" y toast; si falla vuelve a la opción anterior.
- **R4 — Sidebar por módulos.** Cada sección declara de qué módulo depende; se
  ocultan las secciones de módulos apagados:
  - Academia: `ACADEMIA` (Alumnos, Grupos) y `COBROS`.
  - Estudio: `VENTAS` (Paquetes). Las demás secciones del estudio (AGENDA,
    MI PÁGINA) las agrega cada spec cuando su pantalla exista.
  - Siempre: `PRINCIPAL`, `FINANZAS`, `CUENTA`.
- **R5 — Etiqueta.** "Estudiantes" se muestra como **Alumnos** en el sidebar
  (solo texto; la ruta `/dashboard/estudiantes` y la tabla no cambian).
- **R6 — Pantallas del estudio con módulo apagado** muestran un aviso
  "Activa el módulo Estudio en Ajustes" con enlace, en vez de un error.

## Criterios de aceptación

- [x] Un negocio existente no ve ningún cambio en su sidebar salvo "Alumnos".
- [ ] Elegir "Academia + Estudio" en Ajustes muestra la sección VENTAS → Paquetes sin recargar a mano.
- [x] Elegir "Estudio" oculta ACADEMIA y COBROS.
- [x] La migración solo contiene `ALTER TABLE ... ADD COLUMN ... DEFAULT`.

## Pruebas

Unitarias: `nav-items.test.ts` · Funcionales: `tests/functional/catalog.test.ts` (spec 002) · E2E: aviso con módulo apagado. Pendiente manual: el cambio de menú sin recargar.

## Fuera de alcance

- Adaptar el Inicio (dashboard) a negocios solo-Estudio → spec futura.
- Cobro del módulo en el plan de Duali (D8).
