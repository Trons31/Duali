# 001 · Sidebar CUENTA y página Ajustes

**Estado:** Implementada y probada (falta aplicar migraciones en producción) · **Fecha:** 2026-10-09

## Contexto

La sección CUENTA del sidebar mostraba `Mi plan` y `Perfil`. La página Perfil
juntaba un resumen del plan y un formulario largo con una sola barra fija de
guardado al final. CliqCut, que es la referencia de diseño, resuelve lo mismo con
una página **Ajustes** hecha de tarjetas independientes.

## Referencia en CliqCut

- Sidebar: `components/shared/Sidebar.tsx`, sección `CUENTA`
  (`Ajustes` con `IoSettingsOutline`, luego `Mi Plan` con `FiZap`).
- Página: `components/shared/SettingsClient.tsx`
  - Cabecera: `h1` "Ajustes" (`text-xl sm:text-2xl font-bold`) + subtítulo.
  - Cada bloque es una tarjeta `rounded-2xl border p-4 sm:p-6 shadow-sm` con
    ícono + título (`font-semibold`) + descripción corta.
  - Cada tarjeta guarda por su cuenta con un botón a la derecha
    ("Guardar información"), ancho completo en móvil.

## Requisitos

- **R1** — La sección CUENTA del sidebar muestra, en este orden:
  `Ajustes` (ícono de engranaje `IoSettingsOutline`) y `Mi Plan` (ícono `FiZap`).
- **R2** — La página vive en `/dashboard/ajustes`. `/dashboard/perfil` y
  `/dashboard/cliente` redirigen a ella para no romper enlaces viejos.
- **R3** — Cabecera igual a CliqCut: "Ajustes" + "Configura los datos de tu academia".
- **R4** — Tarjeta **Información**: nombre del negocio, tu nombre, teléfono y
  correo (solo lectura). Botón "Guardar información".
- **R5** — Tarjeta **Métodos de pago**: lista editable (nombre + cuenta), agregar
  y quitar. Botón "Guardar métodos de pago".
- **R6** — Tarjeta **Mensaje de cobro**: plantilla de WhatsApp y variables
  disponibles. Botón "Guardar mensaje".
- **R7** — Guardar una tarjeta envía solo sus campos y no descarta lo que se
  esté editando en las otras.
- **R8** — Se quita el resumen de plan de Ajustes (ya está en Mi Plan, igual que
  en CliqCut) y la barra fija de guardado.

## Criterios de aceptación

- [x] El sidebar muestra CUENTA → Ajustes, Mi Plan; el ítem activo se resalta en `/dashboard/ajustes`.
- [x] Entrar a `/dashboard/perfil` lleva a `/dashboard/ajustes`.
- [ ] Editar el teléfono y guardar "Información" muestra el toast de éxito y conserva cambios sin guardar del mensaje de cobro.
- [ ] En móvil (≤ 640px) los botones de guardar ocupan todo el ancho.
- [x] `tsc --noEmit` sin errores.

## Pruebas

Unitarias: `src/components/dashboard/nav-items.test.ts` · E2E: `tests/e2e/studio.e2e.test.ts` (Ajustes, menú, redirección de /perfil). Pendiente manual: guardado por tarjeta en el navegador y vista móvil.

## Fuera de alcance

- Logo / foto del negocio (Duali no tiene almacenamiento de imágenes aún).
- Cambio de correo o contraseña.
- Rediseño del resto de ítems del sidebar.
