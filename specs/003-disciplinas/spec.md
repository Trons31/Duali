# 003 · Disciplinas y combos

**Estado:** Implementada y probada (falta aplicar migraciones en producción) · **Fecha:** 2026-10-09 · **Propuesta:** [estudio/propuesta.md](../estudio/propuesta.md)

## Contexto

El estudio ofrece disciplinas (Body Combat, Rumba Fit, Jump Power) y un combo
(Mix Studio = las tres). Cada disciplina o combo tiene su propia tabla de precios.

### Ajuste respecto a la propuesta

La propuesta modelaba "Mix" como un paquete con varias disciplinas
(`PackageDiscipline`). Al diseñar la tabla de precios se vio que el negocio piensa
"Mix Studio" como **una columna más** del menú (igual que en su Instagram), con su
propio nombre. Por eso se modela como **combo**: una disciplina de tipo `COMBO` que
incluye varias de tipo `CLASE`. El comportamiento aprobado no cambia: un paquete
de un combo sirve para reservar en cualquiera de sus disciplinas.

## Requisitos

- **R1 — Datos (aditivo, tablas nuevas).**
  - `disciplines`: id, clientId, tipo (`CLASE` | `COMBO`), nombre, descripcion?,
    color (hex), orden, activa, createdAt, updatedAt, deletedAt.
  - `discipline_combo_items`: (comboId, disciplineId) — qué clases incluye un combo.
- **R2 — API.** `GET/POST /api/disciplines`, `PUT/DELETE /api/disciplines/[id]`,
  todo filtrado por `clientId`. Borrado lógico (`deletedAt`).
- **R3 — Reglas.**
  - Nombre único por negocio entre las no borradas (409).
  - Un combo incluye al menos 2 disciplinas `CLASE` del mismo negocio.
  - No se puede borrar una disciplina que tenga paquetes activos o que esté en un
    combo activo (409 con el motivo).
- **R4 — Pantalla.** En `/dashboard/paquetes`, pestaña **Disciplinas**: tarjetas
  con punto de color, nombre, descripción y, en combos, las disciplinas incluidas.
  Botones "Nueva disciplina" y "Nuevo combo"; editar y eliminar desde la tarjeta.
- **R5 — Colores** de una paleta fija de 8 (para que la página pública se vea pareja).

## Criterios de aceptación

- [x] Crear Body Combat, Rumba Fit, Jump Power y el combo Mix Studio con las tres.
- [x] Intentar crear un combo con 1 disciplina muestra error.
- [x] Intentar borrar Rumba Fit cuando está en Mix Studio muestra el motivo.

## Pruebas

Funcionales: `tests/functional/catalog.test.ts` (spec 003).

## Fuera de alcance

- Portada/imagen de la disciplina (depende de Cloudinary, spec 010).
