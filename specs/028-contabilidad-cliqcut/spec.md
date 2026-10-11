# 028 · Contabilidad como CliqCut, cabecera compacta y selects del panel

**Estado:** Implementada y probada · **Fecha:** 2026-10-11

## Contexto

Pedido de la dueña, con capturas de Duali y de CliqCut:

1. Los filtros nuevos de Cobros › Historial (spec 027) eran `<select>` del
   navegador; en el panel los selects llevan el estilo propio (sin la flecha del
   sistema, con ícono y flecha nuestros), como en Alumnos y Grupos.
2. La cabecera del menú (logo, negocio, persona y plan) ocupa mucho; en CliqCut es
   más compacta.
3. La Contabilidad de Duali (mes, métodos de pago, movimientos) no separa los
   pagos a instructores, que son egresos (como en Nubi). Debe parecerse a la de
   CliqCut: filtros de periodo, resumen, por instructor y egresos; quitar lo demás.

## Referencias

- **CliqCut** `components/owner/AccountingClient.tsx`: filtros Hoy · Esta semana ·
  Este mes · Mes pasado · Elegir mes · Personalizado · Ver por día · Ciclo de pago;
  tarjetas Ingresos · Egresos operativos · Pagos a barberos · Ganancia neta;
  pestañas Resumen · Por barbero · Egresos.
- **CliqCut** `components/shared/Sidebar.tsx`: cabecera con logo de 36 px, nombre
  en hasta dos líneas, persona y plan en 11 px.

## Decisiones

- **D1 — Pagos a instructores = egresos.** El pago a un instructor ya crea su
  egreso (spec 023); Contabilidad lo cuenta aparte en "Pagos a instructores" y lo
  agrupa con esa categoría. "Egresos operativos" son los demás.
- **D2 — Sin "Adelantos"** (Duali no los tiene) ni "Productos vendidos".
- **D3 — Ciclo de pago** solo aparece si el estudio tiene ciclos de instructores.
- **D4 — Se quitan** las secciones Métodos de pago y Movimientos. Los métodos
  quedan como chips dentro de Ingresos del Resumen.
- **D5 — Contabilidad solo se lee** (como CliqCut): los egresos se registran y
  eliminan en Egresos; desde aquí hay enlaces.

## Requisitos

- **R1 — `SelectField`** (`components/ui/select-field.tsx`): select nativo con el
  estilo del panel. Se usa en Cobros › Historial, el pago en dos partes, el
  instructor del horario y la duración de la clase.
- **R2 — Periodos** (`lib/accounting-period.ts`, puro, en hora de Bogotá).
- **R3 — Informe** `GET /api/accounting/report?filter=…` (`lib/accounting-report.ts`):
  ingresos por origen y por método (con las partes de la spec 027), egresos con su
  origen, por instructor (clases dictadas, generado y pagado en el periodo,
  pendiente a hoy) y ganancia neta.
- **R4 — Pantalla** (`accounting-panel.tsx`) con los filtros, tarjetas y pestañas
  de CliqCut. "Por instructor" solo si hay instructores o pagos a instructores.
- **R5 — Permisos:** el informe usa la regla existente de `/api/accounting`
  (CONTABILIDAD).
- **R6 — Cabecera compacta** del menú (`shell.tsx`).

## Fuera de alcance

- Descargar el informe en PDF (CliqCut lo tiene en Reportes).

## Pruebas

`src/lib/accounting-period.test.ts`, `tests/functional/accounting-report.test.ts`,
`tests/e2e/accounting.e2e.test.ts`.
