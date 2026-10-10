# 004 · Paquetes y precios

**Estado:** Implementada y probada (falta aplicar migraciones en producción) · **Fecha:** 2026-10-09 · **Propuesta:** [estudio/propuesta.md](../estudio/propuesta.md)

## Contexto

Cada disciplina o combo tiene paquetes: Individual (1 clase), Básico (4/mes),
Plus (8), Premium (12), Full Studiodance (20), con precios distintos según la
disciplina. Decisiones aprobadas: vigencia de 30 días desde la activación (D3) y
las clases no usadas se pierden (D4) — ambas se aplican al **vender** (spec 006);
aquí solo se define el catálogo.

## Requisitos

- **R1 — Datos (aditivo, tabla nueva).** `packages`: id, clientId, disciplineId,
  nombre, clases (≥1), precio (≥0), vigenciaDias (default 30), visiblePublico
  (default true), activo (default true), orden, createdAt, updatedAt, deletedAt.
  Un paquete de 1 clase es la **clase suelta** (no hay campo aparte).
- **R2 — API.** `GET/POST /api/packages`, `PUT/DELETE /api/packages/[id]`.
  `POST` acepta `disciplineIds[]` y crea un paquete por disciplina con el mismo
  nombre, clases y precio (para cargar el menú rápido y luego ajustar precios).
- **R3 — Reglas.** No se repite (disciplina, nombre) entre paquetes no borrados
  (409). La disciplina debe ser del negocio y estar activa.
- **R4 — Pantalla.** `/dashboard/paquetes`, pestaña **Precios** (por defecto):
  una tarjeta por disciplina/combo, como las historias del Instagram, con sus
  paquetes ordenados por clases: nombre, "4 clases/mes" o "Clase suelta", precio.
  Editar, pausar (no visible / inactivo) y eliminar desde cada fila.
  "Nuevo paquete" abre un modal con selección múltiple de disciplinas.
- **R5 — Carga inicial.** `scripts/seed-studio-catalog.ts --email <correo>` crea
  el catálogo del cliente (sección 1 de la propuesta). Es idempotente: no duplica
  ni modifica lo que ya existe.
- **R6 — Sidebar.** VENTAS → **Paquetes** (`/dashboard/paquetes`), visible solo con
  el módulo Estudio.

## Criterios de aceptación

- [x] Crear "Básico · 4 clases · $55.000" para Body Combat y Rumba Fit en un solo paso.
- [x] Editar el precio de Jump Power Básico a $65.000 no afecta a las otras.
- [x] El script de carga, corrido dos veces, deja 3 disciplinas, 1 combo y 19 paquetes.
- [x] `tsc --noEmit` sin errores.

## Pruebas

Funcionales: `tests/functional/catalog.test.ts` (spec 004, incluye el script de carga ejecutado de verdad).

## Fuera de alcance

- Vender paquetes y descontar clases → spec 006.
- Mostrar precios en la página pública → spec 008.
