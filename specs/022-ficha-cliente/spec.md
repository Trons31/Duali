# 022 · Rediseño de la ficha del cliente

**Estado:** Aprobada (en curso) · **Fecha:** 2026-10-10

## Contexto

La ficha (`/dashboard/clientes/[id]`) creció spec a spec (006, 019, 020, 021) y hoy
se ve desordenada:

1. **El plan ocupa media pantalla.** Las tarjetas van en dos columnas; con un solo
   plan queda la mitad derecha vacía.
2. **Demasiados botones de estilos distintos:** "Registrar pago" (verde, en dos
   líneas), "Extender" (borde), "Avisado" y "Enviar Mi plan" (texto suelto). No se
   sabe cuál es la acción principal.
3. **Pagos confusos:** dice "PAGOS (0)" y debajo muestra un pago tachado, sin
   explicar que está anulado.
4. **Saldo en alarma:** una franja roja a todo lo ancho, aunque el saldo esté en plazo.
5. **El comprobante por revisar está lejos del plan** que paga, en otra sección.

## Referencias

- **CliqCut** `components/clients/ClientsPage.tsx`: tarjeta blanca `rounded-2xl`
  con separadores suaves, números en negrita (`font-black tabular-nums`) con su
  etiqueta pequeña, chips `brand-50`, títulos de tabla en mayúscula pequeña.
- **CliqCut** `PaymentsClient.tsx`: historial de pagos en filas, con el anulado
  marcado con una etiqueta, no solo tachado.

## Decisiones

- **D1 — Resumen arriba, acciones dentro del plan.** El encabezado responde lo que
  la dueña pregunta primero: cuántas clases le quedan, cuándo es su próxima clase
  y si debe. Las acciones viven en la tarjeta del plan que afectan.
- **D2 — Una acción principal por plan**, la que toca según el caso: *Aprobar
  comprobante* (si hay uno por revisar), *Registrar pago* (si debe), *Renovar* (si
  está por vencer, vencido o agotado) o *Reservar clase*. El resto va en un menú
  "Más" (Extender, Enviar Mi plan, Anular).
- **D3 — El comprobante por revisar va dentro del plan** que paga, con su foto,
  Aprobar y Rechazar.
- **D3 (ajuste del 2026-10-10, pedido de la dueña):** el recuadro suelto del
  comprobante no queda bien. Cada plan termina en **pestañas**: *Pagos (N)* ·
  *Comprobantes* · *Clases (N)*. Comprobantes muestra todos los del plan (por
  revisar, aprobados y rechazados con su motivo); si hay alguno sin validar, la
  pestaña lleva un globo con el número (como una notificación) y se abre sola. La
  acción principal pasa a ser **Revisar comprobante**, que abre esa pestaña.
- **D5 — Varios planes:** arriba de la tarjeta, un selector con un botón por plan
  (nombre, "quedan X de Y" o su estado, y el globo si tiene comprobante sin
  validar). Se ve un plan a la vez; empieza en el que tiene algo por revisar.
- **D4 — Dos columnas en computador** (plan ancho a la izquierda; próximas clases y
  notas a la derecha). En el celular, una columna en ese orden.

## Boceto (computador)

```
← Clientes
┌──────────────────────────────────────────────────────────────────────────┐
│ (S)  Sofía Martínez                         [WhatsApp] [Editar] [⋯]      │
│      300 000 0105 · cumple 3 mar                                         │
│ ──────────────────────────────────────────────────────────────────────── │
│  20            mar 14 · 6:00 p. m.      $290.000              oct 2026   │
│  clases        próxima clase            debe · antes 16 oct   cliente    │
│  disponibles   Body Combat                                    desde      │
└──────────────────────────────────────────────────────────────────────────┘

PLAN ACTUAL                                        [+ Vender paquete]
┌────────────────────────────────────────────────┐ ┌──────────────────────┐
│ ● Full Studiodance · Mix Studio     (Vigente)  │ │ PRÓXIMAS CLASES       │
│   9 oct – 7 nov · Compró en línea              │ │ mar 14 · 6 pm  Body…  │
│                                                │ │ jue 16 · 7 pm  Rumba  │
│  20 de 20 clases disponibles                   │ │            Cancelar ▸ │
│  ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ └──────────────────────┘
│  0 asistió · 0 faltó · 0 reservadas            │ ┌──────────────────────┐
│ ┌────────────────────────────────────────────┐ │ │ NOTAS                 │
│ │ Pagado $0 de $290.000                      │ │ │ Prefiere la tarde.    │
│ │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ │ └──────────────────────┘
│ │ Debe $290.000 · paga antes del 16 oct      │ │
│ └────────────────────────────────────────────┘ │
│ ┌ Comprobante por revisar ───────────────────┐ │
│ │ [foto]  Nequi · enviado hoy 9:40 a. m.     │ │
│ │         [Rechazar]  [Aprobar $290.000]     │ │
│ └────────────────────────────────────────────┘ │
│                                                │
│ [ Registrar pago ]  [ Renovar ]  [ Más ▾ ]     │
│                                                │
│ ▸ Pagos (1 · 1 anulado)   ▸ Clases (0)         │
└────────────────────────────────────────────────┘

HISTORIAL DE PLANES
│ Básico · Body Combat   1 sep – 30 sep   Usó sus 4 clases   Pagado   ›     │
│ Básico · Body Combat   1 ago – 30 ago   Venció             Pagado   ›     │
```

- **Pagos (desplegable):** filas `9 oct 2026 · Nequi · $290.000`; el anulado lleva
  la etiqueta gris **Anulado** y no suma. El título cuenta solo los válidos y dice
  cuántos anulados hay.
- **Más ▾:** Extender vencimiento, Enviar Mi plan por WhatsApp, Avisar por WhatsApp
  (si hay aviso), Anular venta (en rojo, al final).
- **Varios planes vigentes:** una tarjeta ancha por plan, una debajo de la otra.
- **Sin plan:** la tarjeta dice "Sin plan vigente" con **Vender paquete** y, si
  tuvo uno, **Renovar {plan}**.

### Pestañas y varios planes (D3 ajustada y D5)

```
PLANES ACTUALES (2)                                   [+ Vender paquete]
┌────────────────────────────┐ ┌────────────────────────────┐
│● Full Studiodance · Mix (1)│ │● Básico · Rumba            │   ← selector
│  Pago en revisión          │ │  Quedan 3 de 4             │
└────────────────────────────┘ └────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ ● Full Studiodance · Mix Studio                       (Vigente)  │
│   ... clases y pago ...                                          │
│ [ Revisar comprobante ]  [ Registrar pago ]            [ Más ▾ ] │
│──────────────────────────────────────────────────────────────────│
│  Pagos (0)    Comprobantes (1)    Clases (0)                     │
│               ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾                                   │
│ [foto] Nequi                                   (Por revisar)     │
│        10 oct 2026, 9:57 a. m.                                   │
│        [✓ Aprobar $160.000]  Rechazar                            │
│ [foto] Nequi                                   (Rechazado)       │
│        8 oct · Motivo: no se ve el monto                         │
└──────────────────────────────────────────────────────────────────┘
```

## Requisitos

- **R1** Encabezado con resumen (D1): clases disponibles, próxima clase, saldo con
  su fecha (rojo solo si está vencido) y "cliente desde".
- **R2** Tarjeta de plan a todo lo ancho de su columna, con acción principal (D2) y
  menú Más.
- **R3** Pestaña Comprobantes dentro del plan (D3), con Aprobar y Rechazar (los
  mismos de spec 014/021) y el globo cuando hay alguno sin validar.
- **R4** Pagos, Comprobantes y Clases como pestañas; los pagos anulados con etiqueta.
- **R7** Con varios planes vigentes, selector de plan (D5).
- **R5** Historial de planes en filas compactas, no en tarjetas.
- **R6** Celular: una columna, botones de al menos 44 px de alto y textos sin cortes.

Sin cambios de datos ni de API: solo la pantalla.

## Criterios de aceptación

- [ ] Con un plan, la tarjeta usa todo el ancho de su columna.
- [ ] Cada plan tiene una sola acción principal; el resto está en Más.
- [ ] Un pago anulado dice "Anulado" y no cuenta en "Pagos (N)".
- [ ] El comprobante por revisar se aprueba desde la pestaña Comprobantes del plan,
  que lleva el globo con el número y se abre sola.
- [ ] Con dos planes se ve un selector y un plan a la vez.
- [ ] En 390 px no hay desbordes ni botones en dos líneas.

## Pruebas

De punta a punta: la ficha muestra el resumen, la acción principal correcta en cada
caso (debe, en revisión, por renovar) y "Anulado" en un pago anulado. Revisión en
navegador a 390 px y 1280 px.
