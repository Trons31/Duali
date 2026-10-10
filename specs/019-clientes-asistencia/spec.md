# 019 · Clientes, clases sueltas y asistencia

**Estado:** Implementada · **Fecha:** 2026-10-09

## Contexto

Con el demo cargado se ven cuatro problemas en el panel del estudio:

1. **Dos pantallas para lo mismo.** "Clientes" y "Paquetes vendidos" muestran
   casi la misma información con filtros que se cruzan (Con saldo está en las dos).
2. **La clase suelta parece un plan mensual.** "Individual · Rumba Fit" sale con
   barra de clases y "vence 7 de nov", como si fueran 30 días de plan.
3. **No se sabe cuántas clases le quedan a cada cliente ni cuáles tomó.** La
   asistencia solo se marca dentro del detalle de cada clase; en la ficha del
   cliente no hay historial. "20 de 20 clases" no dice si son usadas o disponibles.
4. **Acciones destructivas sin confirmación.** Anular un pago se hace con un toque
   en la ✕; otras usan confirmaciones dentro de la tarjeta en vez del modal.

## Referencias

- **CliqCut** `components/owner/PaymentsClient.tsx`: pestañas generales de página
  (fijas arriba, subrayadas, con ícono; el título describe la pestaña activa) sobre
  `ScrollableTabs` (en Duali: `ScrollHint`, spec 017).
- **Duali Academia** `components/ui/confirm-dialog.tsx`: el modal de confirmación
  (título, descripción, aviso en rojo, Cancelar / acción en rojo).

## Decisiones

- **D1 — Una sola sección "Clientes" con pestañas generales:**
  **Clientes · Planes · Clases sueltas**. "Paquetes vendidos" sale del menú y su
  dirección (`/dashboard/ventas`) lleva a la pestaña Planes. Los filtros de cada
  pestaña quedan como chips debajo, como hoy.
- **D2 — Plan o clase suelta, sin cambiar la base:** una venta de **1 clase** es una
  *clase suelta*; con **más de 1** es un *plan*. Se calcula al leer.
- **D3 — La clase se sigue descontando al reservar** (decisión D2 de la propuesta
  del estudio). La asistencia registra qué pasó con esa clase. Qué hacer con una
  inasistencia lo decide el estudio en Ajustes (D4).
- **D4 — Política de inasistencia** en Ajustes › Reservas: *"Si no asiste, pierde la
  clase"* (por defecto, como hoy) o *"Si no asiste, se le devuelve la clase"*.
- **D5 — La asistencia se toma donde ocurre la clase:** pestaña **Asistencia** en
  Horario de clases y botón **Tomar asistencia** en las clases de hoy del Inicio.
- **D6 — Confirmar todo lo que borra:** toda acción que elimina, anula, cancela,
  rechaza o quita algo **guardado** abre el `ConfirmDialog` (en la página pública,
  su equivalente con el estilo de la página). Excepción: quitar algo de un
  formulario que aún no se guarda (p. ej. la foto elegida o un método de pago antes
  de Guardar), porque no se pierde nada hasta guardar.

## Modelo (aditivo)

- `clients.devolverClaseInasistencia BOOLEAN NOT NULL DEFAULT false` (D4).
- `bookings.asistenciaAt TIMESTAMP NULL`: cuándo se marcó la asistencia.
- `bookings.sinReserva BOOLEAN NOT NULL DEFAULT false`: llegó sin reservar (R6).

Nada se renombra ni se borra; la migración solo agrega columnas con default o nulas.

## Requisitos

### A. Confirmaciones (D6)

- **R1 — Hook `useConfirm`** que abre el `ConfirmDialog` y devuelve una promesa
  (`await confirm({...})`), para que cada acción lo use con una línea.
- **R2 — Inventario** (todas pasan al modal):

  | Pantalla | Acción | Hoy |
  | --- | --- | --- |
  | Ficha del cliente | Anular pago | sin confirmación |
  | Detalle de clase | Quitar de la lista de espera | sin confirmación |
  | Detalle de clase | Cancelar reserva (con "devolver clase") | confirmación en la tarjeta |
  | Detalle de clase | Cancelar esta clase (con motivo) | confirmación en la tarjeta |
  | Detalle de clase | Desmarcar asistencia | sin confirmación |
  | Página pública | Salir de la lista de espera | sin confirmación |
  | Página pública | Cancelar mi reserva | confirmación en la tarjeta |
  | Ficha / Paquetes / Horario / Contenido / Academia | Eliminar cliente, paquete, disciplina, horario, publicación, egreso, grupo, mensualidad, cobro de útiles | ya con modal (se revisa el texto) |
  | Ficha del cliente | Anular venta · Avisos: Rechazar comprobante | ya con modal propio |

  Cada modal dice **qué se pierde y qué no** (p. ej. "Se anula el pago de
  $290.000 del 9 de oct. La venta queda debiendo $290.000. El registro queda en el
  historial.").

### B. Pestañas de Clientes (D1)

- **R3 — Pestañas generales** fijas arriba al desplazarse, con conteo:

  ```
  ┌──────────────────────────────────────────────────────────────┐
  │  👥 Clientes 6     🎟 Planes 4     ① Clases sueltas 1       │  ← subrayada la activa
  ├──────────────────────────────────────────────────────────────┤
  │  Clientes                                    [+ Nuevo cliente]│
  │  Quienes compran planes y reservan clases                    │
  │  [ Buscar por nombre o celular                             ] │
  │  (Todos 6) (Con plan 4) (Clases por usar 3) (Con saldo 2) (Sin plan 1)
  ```

- **R4 — Pestaña Clientes** (personas). Cada tarjeta muestra lo que la dueña
  pregunta primero: **cuántas clases le quedan**, su próxima clase y si debe.

  ```
  ┌───────────────────────────────────────────┐
  │ (V) Valentina Ruiz            Debe $60.000 │
  │     300 000 0102                        ›  │
  │ ───────────────────────────────────────── │
  │ Plus · Mix Studio                Vigente   │
  │ Quedan 6 de 8  ▰▰▱▱▱▱▱▱   vence 7 de nov  │
  │ Próxima: mar 13 · Jump Power 6:00 p. m.    │
  └───────────────────────────────────────────┘
  ```

  Filtros: Todos · Con plan · Clases por usar (le quedan clases) · Con saldo · Sin plan.

- **R5 — Pestaña Planes** (ventas con más de 1 clase): lo de "Paquetes vendidos"
  hoy, con la barra de clases desglosada (R8) y "Quedan X de Y". Indicadores arriba:
  Vigentes · Por cobrar · Vendido este mes. Filtros: Vigentes · Por vencer ·
  Con saldo · Terminados · Anulados.
- **R6 — Pestaña Clases sueltas** (ventas de 1 clase), en lista por fecha, sin
  barra ni vencimiento mensual:

  ```
  Hoy
  ┌────────────────────────────────────────────────┐
  │ Camila Torres · Rumba Fit                      │
  │ Para: mar 13 · 7:00 p. m.   ● Reservada        │
  │ $15.000                          Debe $15.000  │
  └────────────────────────────────────────────────┘
  ```

  Estado de la clase suelta: *Sin usar* (vence el día X) · *Reservada* ·
  *Asistió* · *No asistió*. Filtros: Por usar · Usadas · Con saldo.

### C. Asistencia (D3–D5)

- **R7 — Tomar asistencia** (pestaña Asistencia en Horario y botón en el Inicio):
  las clases del día con su lista; un toque por persona y "Todos asistieron".

  ```
  Martes 13 de octubre
  ┌──────────────────────────────────────────────────────┐
  │ 6:00 p. m. · Jump Power                 8/12 cupos    │
  │ ─────────────────────────────────────────────────── │
  │ Laura Gómez       Básico · quedan 3     [✓] [✗]       │
  │ Valentina Ruiz    Plus · quedan 6       [✓] [✗]       │
  │ …                                                    │
  │ [ Todos asistieron ]        [ + Llegó sin reservar ]  │
  └──────────────────────────────────────────────────────┘
  Pendientes de días anteriores (2 clases sin marcar)  ›
  ```

  - ✓ Asistió · ✗ No asistió; tocar de nuevo desmarca (con confirmación, R2).
  - Con la política "se devuelve la clase" (D4), marcar ✗ devuelve la clase y el
    aviso lo dice ("Se le devolvió la clase a Laura").
  - **Llegó sin reservar:** buscar cliente → se descuenta de su plan o se vende una
    clase suelta (con "Pagó ahora") y queda **Asistió** de una vez (`sinReserva`).
    Si la clase está llena, ofrece subir el cupo de esa fecha.
- **R8 — Barra de clases desglosada** en tarjetas de planes y ficha:

  ```
  Quedan 5 de 8
  ▰▰▰ ▰ ▱ ▱▱▱▱      3 asistió · 1 faltó · 1 reservada · 3 disponibles
  ```

  Colores: asistió (color de la disciplina), faltó (rosa), reservada (gris rayado),
  disponibles (vacío). Mismo componente en Clientes, Planes y la ficha.
- **R9 — Historial de clases en la ficha del cliente:** debajo de cada plan, sus
  clases (fecha, disciplina, hora y estado: Reservada · Asistió · No asistió ·
  Cancelada con/sin devolución). Las próximas arriba, las pasadas después.
- **R10 — Asistencia pendiente:** clases que ya terminaron con reservas sin marcar.
  Se cuentan en "Para atender" del Inicio ("2 clases sin asistencia") y se listan
  en la pestaña Asistencia. No bloquean nada: la clase ya se descontó al reservar.
- **R11 — Ajuste** en Ajustes › Reservas: política de inasistencia (D4), con el
  texto de lo que pasa en cada opción.

## API

- `GET /api/attendance?fecha=YYYY-MM-DD` — clases del día con reservas, cliente,
  plan y clases restantes; `?pendientes=1` — clases pasadas sin marcar.
- `PUT /api/bookings/[id]` `{ estado }` — ya existe; guarda `asistenciaAt` y
  aplica D4 (devuelve o no la clase, en la misma transacción).
- `POST /api/class-sessions/attendance` `{ scheduleId, fecha, todos: "ASISTIO" }` —
  marcar todos los sin marcar.
- `POST /api/bookings` `{ ..., llegoSinReservar: true }` — R7, reserva ya asistida.
- `GET /api/studio-members/[id]/history` — R9.

## Criterios de aceptación

- [x] Anular un pago, quitar de la lista de espera, cancelar reserva/clase,
      desmarcar asistencia y salir de la lista (pública) piden confirmación en modal.
- [x] `/dashboard/ventas` lleva a Clientes › Planes; el menú ya no muestra
      "Paquetes vendidos".
- [x] Una venta de 1 clase aparece solo en Clases sueltas, sin "vence en 30 días".
- [x] La tarjeta de un cliente dice "Quedan X de Y" y su próxima clase.
- [x] Marcar asistencia guarda la hora; con "se devuelve la clase", marcar ✗
      devuelve la clase y desmarcar la vuelve a descontar.
- [x] "Llegó sin reservar" deja la reserva en Asistió y descuenta (o vende) la clase.
- [x] El historial de la ficha cuadra con la barra: asistió + faltó + reservadas +
      disponibles = clases del plan (las devueltas no cuentan).
- [x] Inicio cuenta las clases pasadas sin asistencia.
- [x] La migración solo agrega columnas con default o nulas.

## Fases de implementación

1. **Confirmaciones** (R1–R2): rápido y sin cambios de base.
2. **Asistencia** (R7–R11 + migración): el núcleo de esta spec.
3. **Pestañas y vistas** (R3–R6): reorganización de Clientes.

## Pruebas

Unitarias (desglose de la barra, plan vs clase suelta, política de inasistencia),
funcionales (asistencia, devolución, llegó sin reservar, historial, aislamiento por
negocio) y de punta a punta (pestañas, redirección de `/dashboard/ventas`,
Asistencia en Horario, modales de confirmación).

## Fuera de alcance

- Que la clienta marque su llegada sola (código QR o enlace).
- Marcar asistencia automáticamente al terminar la clase.
- Congelar o pausar un plan (vacaciones, lesión).
