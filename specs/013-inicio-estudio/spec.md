# 013 · Inicio del panel para el estudio

**Estado:** Implementada y probada · **Fecha:** 2026-10-09

## Contexto

El Inicio (`/dashboard`) solo muestra la Academia (mensualidades, inscripciones,
grupos). Un negocio que es solo Estudio ve todo en cero y no encuentra lo que le
importa al abrir el panel: qué clases tiene hoy, quién reservó y qué falta cobrar.
Quedó anotado como pendiente en la spec 002.

## Objetivo de experiencia

Al abrir el panel, la dueña del estudio sabe en un vistazo **cómo va su día** y
**qué tiene que hacer**, y llega a cada tarea con un toque.

## Requisitos

- **R1 — Qué Inicio se ve:**
  - Solo Academia → el Inicio de siempre (sin cambios).
  - Solo Estudio → el Inicio del estudio.
  - Ambos → selector **Estudio | Academia** arriba (`?vista=`), por defecto Estudio.
- **R2 — Cabecera:** saludo, nombre del negocio y fecha de hoy; botones rápidos
  **Vender paquete** (→ Clientes), **Ver horario** y **Compartir mi página**
  (WhatsApp, solo si está publicada).
- **R3 — Indicadores** (datos reales, hora de Bogotá):
  - Clases de hoy y reservas de hoy.
  - Ocupación de la semana: reservas / cupos de las clases no canceladas (%).
  - Ingresos del mes por paquetes (pagos no anulados de ventas no anuladas).
  - Por cobrar: saldo de las ventas no anuladas.
- **R4 — Clases de hoy:** hora, disciplina, reservados/cupo con barra, cancelada;
  cada una lleva al Horario.
- **R5 — Para atender:** paquetes por vencer o con pocas clases, clientes con
  saldo y recordatorios de mañana, con enlace a **Avisos**.
- **R6 — Reservas recientes en línea:** las últimas 5 hechas desde la página pública.
- **R7 — Empezar:** si el estudio aún no tiene disciplinas, horario o página
  publicada, una lista de pasos con enlace a cada pantalla.

## Criterios de aceptación

- [x] Un negocio solo Academia ve exactamente el Inicio de antes.
- [x] Con 2 clases hoy (15 cupos) y 3 reservas, muestra "2 clases" y "3 reservas".
- [x] La ocupación de la semana se calcula sobre clases no canceladas.
- [x] Ingresos del mes no cuentan pagos anulados ni ventas anuladas.
- [x] Reservas recientes solo incluye las de la página pública, del propio negocio.
- [x] Un estudio nuevo ve los pasos para empezar.

## Pruebas

- Unitarias: `src/lib/studio-dashboard.test.ts` (mes en hora de Bogotá, cambio de año, pago a las 11 p. m. del último día).
- Funcionales: `tests/functional/studio-dashboard.test.ts` (estudio nuevo, clases y reservas de hoy, ocupación sin
  canceladas, ingresos sin anulados, por cobrar, reservas recientes solo web y del negocio).
- E2E: Inicio con selector Estudio/Academia y datos reales; solo Academia ve el Inicio de antes sin selector.
- Pendiente manual: revisión visual con sesión iniciada (las capturas sin ventana no pueden iniciar sesión).

## Fuera de alcance

- Gráficas históricas (Contabilidad ya tiene el detalle mensual).
