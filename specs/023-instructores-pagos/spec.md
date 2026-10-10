# 023 · Instructores y pagos a instructores

**Estado:** Aprobada (en curso) · **Fecha:** 2026-10-10 · **Aprobada:** 2026-10-10 con los ajustes de "Decisiones de la dueña"

## Contexto

Hoy el instructor es solo un texto libre en cada horario fijo
(`class_schedules.instructor`). No hay registro de instructores, no se sabe qué
disciplinas da cada uno, no hay reemplazos y no hay forma de calcular cuánto se le
debe a cada uno ni de registrar lo que se le paga. La dueña lo lleva en un cuaderno
o en Excel.

CliqCut ya resolvió lo mismo para sus barberos: comisión por porcentaje, pago fijo
por servicio o sueldo fijo; un **ciclo de pago** del negocio (frecuencia y día);
ciclos por barbero con **fotografías congeladas** de lo causado; pagos parciales,
saldos de ciclos anteriores, adelantos e infracciones; y una página de **Pagos** con
Pendientes e Historial y el detalle de cada pago.

**Lo que cambia en un estudio:** en una barbería el dinero entra por cada servicio,
con su precio, y la comisión sale de ese precio. En un estudio el dinero entra
**antes**, por planes de varias clases, y una clase la toman varias personas con
planes distintos. Por eso no sirve "porcentaje del servicio": hay que decidir qué
cuenta como trabajo del instructor (la clase dictada, cada alumno que asistió o el
valor de las clases que se tomaron) y de dónde sale ese valor.

## Referencias (CliqCut-Web)

| Qué | Dónde | Qué tomamos |
| --- | --- | --- |
| Configuración de la comisión | `prisma/schema.prisma` `Commission` (`PERCENTAGE`, `FIXED`, `SALARY`) | Tipos de pago por persona |
| Ciclo del negocio | `PaymentCycle` (`frequency`, `payDay`, `payDayStartsNextCycle`, `ledgerActivatedAt`) y `lib/payment-cycle.ts` | Frecuencias, día de pago, el interruptor "lo del día de pago entra al siguiente", activación sin deuda histórica |
| Fotografía del ciclo | `BarberPaymentCycle` (`*Snapshot`, `grossAmount`, `earnedAmount`, `advanceAmount`, `penaltyAmount`, `netAmount`, `paidAmount`, `remainingAmount`, `status`, `settlementStatus`, `snapshotQuality`) | Ciclo por persona con valores congelados |
| Detalle congelado | `BarberPaymentCycleSession` (una fila por atención con bruto, tipo, valor y ganado congelados) | Una fila por clase dictada |
| Pagos y abonos | `BarberPayment`, `BarberPaymentAllocation` (pago mixto), `BarberPaymentApplication` (un pago reparte entre ciclos) | Pagos parciales, saldos anteriores, varios métodos |
| Adelantos e infracciones | `BarberPurchase` (adelantos), `BarberPenalty` (% sobre el ciclo) | Ajustes que suman o restan en el ciclo |
| Materialización | `lib/barber-payment-ledger.ts` `ensureBarberPaymentLedgerForShop` (idempotente, una transacción por barbero) | Cerrar y abrir ciclos al consultar, sin cron |
| Pantalla | `components/owner/PaymentsClient.tsx`, `CycleSummaryCard.tsx`, `PaymentHistoryDetailModal.tsx` | Pendientes/Historial, total pendiente, tarjeta por persona, confirmar pago, historial agrupado por ciclo, detalle |

## Decisiones de la dueña (2026-10-10)

1. **Por alumno** gana por **todos** los alumnos, vengan de un plan, un combo o una
   clase suelta, y puede ser un **valor fijo** o un **porcentaje** del valor de la
   clase de cada alumno. (La forma "Porcentaje" queda dentro de "Por alumno".)
2. **Base del porcentaje:** el estudio elige **precio vendido** o **solo lo cobrado**.
3. **Alumnos:** solo los que asistieron, con el interruptor para contar inasistencias.
4. **Ciclos como CliqCut:** uno para comisiones y otro para sueldos.
5. **Egresos como CliqCut:** cada pago y adelanto crea su egreso. Y un pago se puede
   registrar **en dos formas** a la vez (por ejemplo, efectivo + Nequi).

## Decisiones

### D1 — Formas de pago

Cada instructor tiene **una forma de pago**:

| Forma | Cómo se calcula | Ciclo | Ejemplo |
| --- | --- | --- | --- |
| **Sueldo fijo** | Un valor por ciclo de sueldos, dicte lo que dicte. | Sueldos | $1.200.000 al mes |
| **Por clase dictada** | Valor fijo × clases dictadas. | Comisiones | $35.000 × 12 clases = $420.000 |
| **Por alumno · valor fijo** | Valor × alumnos de la clase, clase por clase. | Comisiones | $6.000 × 9 alumnos = $54.000 |
| **Por alumno · porcentaje** | % del valor de la clase de **cada** alumno (plan, combo o clase suelta, D2), sumado clase por clase. | Comisiones | 40 % de $65.000 = $26.000 |
| **Sueldo + variable** | Sueldo base en el ciclo de sueldos + una variable (por clase, por alumno fijo o por alumno %) en el de comisiones. | Ambos | $600.000 + 30 % por alumno |

Para las variables, dos opciones por instructor:

- **Mínimo por clase** (opcional): si la clase da menos, se paga el mínimo.
  *$6.000 × 3 alumnos = $18.000, con mínimo $30.000 → $30.000.*
- **Desde cuántos alumnos se paga** (opcional, por defecto 1): una clase con menos
  alumnos no genera pago variable (ni mínimo).

### D2 — Qué vale la clase de cada alumno (para el porcentaje)

El valor de cada asistencia es **el precio del plan con que reservó ÷ sus clases**:
un plan de $160.000 con 8 clases aporta $20.000 por clase; un combo igual; una clase
suelta aporta su precio; una cortesía ($0) aporta $0. Se usa el precio vendido (con
descuento si lo hubo).

**Base del porcentaje** (decisión de la dueña, se elige en el ciclo de pago):

- **Precio vendido** (por defecto): cuenta el valor completo aunque la clienta aún
  no haya pagado. El instructor cobra por el trabajo hecho.
- **Solo lo cobrado:** cada asistencia aporta su valor × lo pagado del plan ÷ su
  precio. Si la clienta paga después, la diferencia se suma sola al ciclo de
  comisiones abierto en ese momento, en una línea **"Cobrado después"** con el plan
  y la clase de origen. Si la venta se anula, lo que no se cobró no se paga.

### D3 — Qué cuenta como trabajo

- Cuenta la clase **dictada**: no cancelada y ya terminada, del instructor que la
  dictó (D5).
- **Alumnos** = reservas marcadas **Asistió**, incluidas las que llegaron sin
  reservar (spec 019). Interruptor por estudio: **"Las inasistencias también
  cuentan"** (apagado): la clienta pierde la clase y el cupo estuvo ocupado, así que
  algunos estudios pagan igual.
- **Clases sin alumnos:** con *por clase dictada* se pagan solo si tuvieron al menos
  un alumno, salvo que actives **"Pagar clases aunque no llegue nadie"**.
- **Clases sin asistencia marcada** al cierre: no se adivinan. El pago muestra
  "3 clases sin asistencia marcada" con enlace para marcarlas, igual que la retención
  de ciclo de CliqCut, y se pueden pagar igual si la dueña decide.
- **Clase cancelada por el estudio:** no se paga.

### D4 — Disciplinas y valores por disciplina

Un instructor se relaciona con las disciplinas que da (de ahí sale la lista de
instructores al armar el horario). La forma de pago es una sola, pero el **valor
puede cambiar por disciplina** (Pilates $45.000 por clase, Rumba $30.000). Si una
disciplina no tiene valor propio, usa el general.

### D5 — Quién dictó la clase: titular y reemplazos

El horario fijo tiene su **instructor titular**. Una fecha puntual puede tener un
**reemplazo** desde el detalle de la clase ("Hoy la dicta Laura"). La clase se le
paga a quien la dictó, con la forma de pago de esa persona.

### D6 — Ciclos de pago del estudio (como CliqCut)

Dos ciclos, cada uno con **frecuencia** (diario, semanal, quincenal o mensual) y
**día de pago** (día de la semana o del mes, 1 a 28):

- **Comisiones:** por clase y por alumno (por defecto semanal).
- **Sueldos:** sueldo fijo y la parte fija de *Sueldo + variable* (por defecto
  mensual, día 15).

Más el interruptor **"Lo del día de pago entra al ciclo siguiente"** (para los dos),
las reglas de D3 y la base del porcentaje (D2). Hasta configurarlos, Pagos solo
invita a configurarlos. El primer ciclo empieza el día en que se configura: **no se
genera deuda de antes**. Un instructor con *Sueldo + variable* tiene dos ciclos
abiertos, uno en cada calendario.

### D7 — Fotografías congeladas

- Al abrir un ciclo se congela la forma de pago del instructor (tipo, valores,
  mínimos, valores por disciplina) en ese ciclo.
- Cada clase dictada queda como una fila del ciclo con lo que se usó para calcularla:
  disciplina, fecha, alumnos, valor de las clases tomadas, tipo y valor aplicado y lo
  ganado.
- **Mientras el ciclo no tenga pagos**, se recalcula al consultar (si marcan una
  asistencia tarde o cambian un reemplazo, se refleja). **Con el primer pago queda
  congelado:** los cambios posteriores no lo mueven y se avisa en el detalle de la
  clase ("Esta clase ya se pagó al instructor; el cambio no altera ese pago").
- **Cambiar la forma de pago** de un instructor pregunta desde cuándo: *este ciclo*
  (solo si aún no tiene pagos; recalcula) o *el próximo*.

### D8 — Pagos, saldos, adelantos y ajustes

- **Pago:** total o parcial; lo que falta queda como **saldo pendiente** del ciclo y
  aparece en el siguiente pago ("Saldo anterior"). Un pago puede cubrir saldo
  anterior + ciclo actual.
- **Método:** Efectivo, Nequi, Bancolombia, Transferencia u Otro. Un pago se puede
  registrar **en dos formas** a la vez (por ejemplo $400.000 en efectivo + $242.000
  por Nequi): en el historial queda como **Mixto** con su desglose, como
  `BarberPaymentAllocation` de CliqCut.
- **Adelanto:** plata entregada antes; se descuenta del siguiente pago (completo o
  hasta donde alcance, y el resto queda para el próximo).
- **Ajustes:** **bonificación** (suma) o **descuento** (resta), valor fijo o % del
  ciclo, con motivo. Cubre las "infracciones" de CliqCut y también los bonos.
- **Contabilidad:** cada pago y cada adelanto crea su **egreso** (categoría Nómina o
  Comisión según la forma de pago), enlazado al pago. Así Contabilidad y Egresos
  cuadran sin registrar nada dos veces. Anular un pago anula su egreso.

### D9 — Dónde vive en el menú

Una sección nueva **EQUIPO** (solo con el módulo Estudio): **Instructores** y
**Pagos a instructores**.

*Desde la spec 024:* EQUIPO tiene **Colaboradores** (`/dashboard/colaboradores`,
con la pestaña Instructores) y **Pagos** (`/dashboard/colaboradores/pagos`). Las
direcciones viejas redirigen.

## Modelo (aditivo)

Todo nuevo o columnas nulas; nada se renombra ni se borra.

- `instructors`: `id, clientId, nombre, apellido?, celular?, email?, color,
  activo, notas?, sueldo? (fijo por ciclo de sueldos), variable? (POR_CLASE |
  ALUMNO_FIJO | ALUMNO_PORCENTAJE), valor? (pesos o %), minimoPorClase?,
  alumnosMinimos (1), createdAt, updatedAt, deletedAt?`. Sueldo fijo = solo
  `sueldo`; variable = solo `variable`; Sueldo + variable = ambos.
- `instructor_disciplines`: `instructorId, disciplineId, valor?` (D4).
- `class_schedules.instructorId?` (titular) — el texto `instructor` se conserva
  para lo viejo y la página pública.
- `class_sessions.instructorId?` (reemplazo de esa fecha, D5).
- `instructor_payment_settings` (uno por estudio, D6, D3 y D2): `frecuencia,
  diaPago, frecuenciaSueldo, diaPagoSueldo, diaPagoAbreSiguiente,
  inasistenciasCuentan, pagarClasesVacias, basePorcentaje (VENDIDO | COBRADO),
  activadoAt`.
- `instructor_cycles` (D7): `instructorId, tipo (COMISION | SUELDO), inicio, fin, venceEl, estado (ABIERTO |
  CERRADO), situacion (SIN_PAGAR | PARCIAL | PAGADO)`, la forma de pago congelada
  (`tipoSnapshot`, `valorSnapshot`, `sueldoSnapshot`, `minimoSnapshot`,
  `alumnosMinimosSnapshot`, `valoresDisciplinaSnapshot JSON`) y los totales
  (`clases, alumnos, generado, sueldo, ajustes, adelantos, neto, pagado, pendiente`),
  `calidad (CONFIRMADO | RECONSTRUIDO)`. Único por instructor + tipo + inicio + fin.
- `instructor_cycle_classes`: una fila por clase dictada, única por horario + fecha
  (una clase se paga una sola vez): `fecha, hora, disciplina, alumnos, inasistencias,
  valorClases, tipoAplicado, valorAplicado, minimoAplicado, ganado`.
- `instructor_payments`: `instructorId, monto, fecha, nota?, anuladoAt?,
  motivoAnulacion?, expenseId?` + `instructor_payment_methods` (método, monto) +
  `instructor_payment_applications` (pago → ciclo, monto).
- `instructor_cycle_collections` (D2, solo lo cobrado): por asistencia, lo ya
  acreditado (`bookingId, cicloId, valor, acreditado`), para sumar "Cobrado después"
  sin pagar dos veces.
- `instructor_adjustments`: `instructorId, tipo (ADELANTO | BONO | DESCUENTO),
  modo (FIJO | PORCENTAJE), valor, motivo, cicloId? (donde se aplicó),
  aplicado, anuladoAt?, expenseId?`.
- `expenses.instructorPaymentId?` no hace falta: el enlace va en el pago y el
  adelanto (`expenseId`).

## Pantallas

### Instructores (`/dashboard/instructores`)

```
Instructores                                         [+ Nuevo instructor]
Quién da cada clase y cómo se le paga

[Buscar]   (Activos 4) (Inactivos 1)
┌────────────────────────────────┐ ┌────────────────────────────────┐
│ (L) Laura Gómez          Activa│ │ (A) Andrés Ruiz          Activo│
│ ● Pilates  ● Mix Studio        │ │ ● Rumba  ● Jump                │
│ Por alumno · $6.000            │ │ Sueldo fijo · $1.200.000/mes   │
│ mín. $30.000 por clase         │ │                                │
│ ───────────────────────────────│ │ ───────────────────────────────│
│ 14 clases · 96 alumnos         │ │ 18 clases este ciclo           │
│ A pagar este ciclo  $612.000 › │ │ A pagar el 15 nov $1.200.000 › │
└────────────────────────────────┘ └────────────────────────────────┘
```

Si el horario tiene instructores escritos a mano que no están registrados, un aviso
ofrece crearlos: "En tu horario aparecen Ana y Luis. [Registrarlos]".

### Nuevo / editar instructor (modal en pasos)

```
┌ Nuevo instructor ───────────────────────────────────────── ✕ ┐
│ Datos         Nombre [Laura]   Apellido [Gómez]              │
│               Celular [300…]   Color ●●●●●                   │
│ Disciplinas   (● Pilates ✓) (● Mix Studio ✓) (● Rumba)       │
│                                                              │
│ ¿Cómo le pagas?                                              │
│ ( ) Sueldo fijo          Un valor por ciclo de sueldos       │
│ ( ) Por clase dictada    Un valor por cada clase             │
│ (•) Por alumno           Por cada alumno que asiste          │
│ ( ) Sueldo + variable    Sueldo base y además una variable   │
│                                                              │
│ Por alumno  (•) Valor fijo   ( ) Porcentaje de su clase      │
│ Valor por alumno [$ 6.000]                                   │
│ Mínimo por clase [$ 30.000] (opcional)                       │
│ Paga desde [1] alumno(s)                                     │
│ ▸ Valor distinto por disciplina                              │
│   Pilates [$ 7.000]   Mix Studio [usa el general]            │
│                                                              │
│ Ejemplo: una clase con 8 alumnos le deja $48.000;            │
│ una con 3 alumnos, $30.000 (el mínimo).                      │
│ [ Cancelar ]                           [ Guardar instructor ] │
└──────────────────────────────────────────────────────────────┘
```

El **ejemplo** se recalcula con lo que escribe, para que la dueña entienda el
efecto antes de guardar.

### Ficha del instructor (`/dashboard/instructores/[id]`)

Mismo diseño que la ficha del cliente (spec 022): encabezado con resumen
(*clases este ciclo · alumnos · a pagar · próximo pago*), tarjeta **Forma de pago**
con Editar, **Clases del ciclo** (fecha, disciplina, alumnos, gana) y **Pagos** en
pestañas *Ciclo actual · Pagos · Adelantos y ajustes*.

### Horario

- El horario fijo elige el **instructor titular** de una lista (los que dan esa
  disciplina primero) en vez de escribirlo.
- El detalle de una clase tiene **Reemplazo para esta fecha** y muestra a quién se
  le paga.

### Pagos a instructores (`/dashboard/instructores/pagos`) — como CliqCut

```
Pagos a instructores                              [⚙ Configurar ciclo de pago]
Lo que le debes a tu equipo y lo que ya les pagaste

┌ Ciclo actual: 1 nov – 15 nov ────────────────── (Faltan 5 días) ┐
│ Se paga el 15 nov, al cierre de las 11:59 p. m.                 │
└─────────────────────────────────────────────────────────────────┘
(Pendientes 3) (Historial 12)

┌─────────────────────────────────────────────── (gradiente) ┐
│ Total pendiente de pago                                    │
│ $2.432.000                                                 │
│ 3 instructores · 44 clases · 1 saldo anterior              │
└────────────────────────────────────────────────────────────┘

POR CLASES Y ALUMNOS  · Quincenal, días 15 y 30 — pendiente $1.232.000
┌────────────────────────────────────────────────────────────┐
│ ⚠ Saldo anterior                                  $80.000  │
│ ⚠ 1 adelanto · $100.000                              Ver   │
│ ⚠ 2 clases sin asistencia marcada               Marcar ›   │
│ (L) Laura Gómez · Por alumno $6.000 (mín. $30.000)         │
│   14 clases   96 alumnos   Generado $612.000               │
│   Adelanto −$100.000   Bono +$50.000                       │
│   A pagar  $642.000                       [ Pagar $642.000 ]│
│   [+ Adelanto]  [+ Ajuste]                 Ver clases ▾    │
│ ── Clases del ciclo ────────────────────────────────────── │
│  lun 3 nov · Pilates 6:00 p. m.   8 alumnos   gana $48.000 │
│  mié 5 nov · Pilates 6:00 p. m.   3 alumnos   gana $30.000 │
│              (mínimo)                                      │
└────────────────────────────────────────────────────────────┘

SUELDOS FIJOS · Mensual, día 15 — pendiente $1.200.000
┌────────────────────────────────────────────────────────────┐
│ (A) Andrés Ruiz · Sueldo fijo $1.200.000                   │
│   18 clases dictadas (informativo)    A pagar $1.200.000   │
└────────────────────────────────────────────────────────────┘
```

**Confirmar pago** (como `PayConfirmModal`):

```
┌ Pagar a Laura Gómez ─────────────────────────────────── ✕ ┐
│ Saldo anterior (16 – 31 oct)                     $80.000  │
│ Ciclo actual (1 – 15 nov)                       $612.000  │
│ Bonificación: clase extra del sábado            +$50.000  │
│ Adelanto del 5 nov                             −$100.000  │
│ ──────────────────────────────────────────────────────── │
│ Total sugerido                                  $642.000  │
│ (•) Saldo + ciclo actual  ( ) Solo saldo  ( ) Parcial     │
│ ¿Con qué le pagas?  [Efectivo $642.000] [+ Dividir]       │
│ Nota (opcional) [__________]                              │
│ ⚠ Hoy no es el día de pago configurado (15 nov).          │
│ [ Cancelar ]                          [ Pagar $642.000 ]  │
└───────────────────────────────────────────────────────────┘
```

**Historial** agrupado por ciclo (encabezado *1 – 15 nov · 3 pagos · $2.432.000*),
cada fila *Laura Gómez · 15 nov · Efectivo · $642.000 ›*, y el **detalle del pago**
(como `PaymentHistoryDetailModal`): forma de pago congelada, clases con su cálculo,
adelantos y ajustes aplicados, saldo anterior, pagado, pendiente, quién lo registró,
nota, y **Anular pago** (con motivo; deshace la aplicación y su egreso).

**Configurar ciclo de pago** (corrección de la dueña, 2026-10-10: igual al de CliqCut):
encabezado fijo, pestañas *Comisiones / Sueldos* solo si el equipo usa las dos, tarjeta
por calendario con frecuencias en tarjetas 2×2 con su check, días Dom–Sáb en botones
o los días 1–28 en cuadrícula con "próximos pagos", el interruptor con su recuadro
Activado/Desactivado, y botones Cancelar / Guardar abajo. **Sin instructores con forma
de pago no se puede configurar** (la API responde 409 y la página lleva a
Colaboradores). Solo aparece el calendario que se usa (sin sueldos, no hay
calendario de sueldos) y solo las reglas que aplican: inasistencias si alguien cobra
por alumno, clases vacías si alguien cobra por clase, base del porcentaje si alguien
cobra por porcentaje.

Antes:
frecuencia (Diario · Semanal · Quincenal · Mensual),
día de pago, "Lo del día de pago entra al ciclo siguiente" con la frase de qué pasa
("Si pagas el 15, el 15 le pagas lo dictado hasta el 14"), y las reglas de D3
("Las inasistencias también cuentan", "Pagar clases aunque no llegue nadie").

## Requisitos

### A. Instructores
- **R1** CRUD de instructores con disciplinas, forma de pago (D1), valores por
  disciplina (D4), activo/inactivo. Eliminar = desactivar si tiene clases o pagos.
- **R2** Ejemplo en vivo del cálculo al configurar la forma de pago.
- **R3** Registrar los instructores escritos a mano en el horario.

### B. Horario
- **R4** Titular en el horario fijo (lista de instructores) y reemplazo por fecha (D5).
- **R5** La página pública sigue mostrando el nombre (del titular o del reemplazo).

### C. Ciclos y cálculo
- **R6** Configuración del ciclo (D6) y reglas de D3.
- **R7** Materialización idempotente de ciclos al consultar Pagos, pagar o cambiar la
  configuración; una transacción por instructor (como CliqCut).
- **R8** Cálculo por clase con la forma de pago congelada (D1–D3, D7).
- **R9** Aviso de clases sin asistencia marcada en el ciclo.

### D. Pagos
- **R10** Página de Pagos con Pendientes/Historial, total pendiente, secciones *Por
  clases y alumnos* y *Sueldos fijos*, tarjeta por instructor (D8).
- **R11** Pagar total o parcial, saldo anterior, pago dividido entre dos métodos,
  nota, aviso si no es día de pago.
- **R12** Adelantos y ajustes (bono/descuento, fijo o %).
- **R13** Historial por ciclo y detalle del pago con su fotografía; anular pago.
- **R14** Egresos enlazados (D8) para que Contabilidad cuadre.

### E. Seguridad y consistencia
- **R15** Todo por negocio (`clientId`); un negocio no ve instructores ni pagos de
  otro.
- **R16** Una clase se paga una sola vez (único por `sessionId`); un pago no puede
  aplicar más que lo pendiente del ciclo (validado en el mismo UPDATE).
- **R17** Montos en pesos enteros, redondeo al peso por clase.

## Criterios de aceptación

- [ ] Por alumno con mínimo: clase de 8 alumnos a $6.000 → $48.000; de 3 → $30.000.
- [ ] Por alumno 40 %: una clase con 2 alumnos de planes de $160.000/8 y una clase
  suelta de $25.000 → 40 % de $65.000 = $26.000.
- [ ] Solo lo cobrado: un plan pagado a la mitad aporta la mitad; cuando se paga el
  resto, la diferencia aparece como "Cobrado después" en el ciclo abierto.
- [ ] Sueldo + variable: el sueldo va al ciclo de sueldos y la variable al de comisiones.
- [ ] Un pago en dos formas queda como Mixto con su desglose y un solo egreso.
- [ ] Sueldo + por alumno suma el sueldo una vez por ciclo más lo variable.
- [ ] Un reemplazo se le paga al reemplazo, no al titular.
- [ ] Una clase cancelada no se paga; una sin alumnos solo con "Pagar clases aunque no
  llegue nadie".
- [ ] Pagar parcial deja saldo y aparece como "Saldo anterior" en el siguiente pago.
- [ ] Un adelanto se descuenta del siguiente pago.
- [ ] Con un pago aplicado, marcar tarde una asistencia no cambia ese ciclo.
- [ ] Cada pago crea su egreso; anularlo lo anula.
- [ ] Sin ciclo configurado, Pagos solo invita a configurarlo.
- [ ] La migración solo agrega tablas y columnas nulas o con default.

## Fases de implementación

1. **Instructores y horario** (R1–R5): registro, disciplinas, titular y reemplazos. ✅ Hecha 2026-10-10 (unitarias y funcionales; faltan e2e y capturas).
2. **Ciclo y cálculo** (R6–R9): configuración, ciclos congelados, cálculo por clase. ✅ Hecha 2026-10-10
   (unitarias y funcionales; e2e escrita, sin correr). Notas de implementación:
   - Una clase se identifica por horario + fecha (`scheduleId, fecha`), no por
     `sessionId`: las clases sin reservas no tienen fila en `class_sessions` y con
     "Pagar clases aunque no llegue nadie" también se pagan.
   - Sin pagos, el ciclo usa la forma de pago de hoy ("aplica a este ciclo"). La
     opción "desde el próximo ciclo" queda para la fase 4, con la ficha del instructor.
   - El sueldo se cuenta completo en cada ciclo de sueldos, también en el primero.
   - Los ciclos sin pagos se recalculan hasta 62 días atrás; los más viejos quedan
     como se calcularon por última vez.
3. **Pagos** (R10, R11, R13, R14): página, pagar, historial, detalle, egresos. ✅ Hecha 2026-10-10
   (unitarias y funcionales; e2e escrita, sin correr). Notas de implementación:
   - Como CliqCut, se elige *Saldo + ciclo actual*, *Solo saldo anterior* o *Solo
     ciclo actual*, y cualquiera puede ser parcial. El pago se aplica del ciclo más
     viejo al más nuevo.
   - Pagar el ciclo actual a mitad de semana no pierde las clases que vienen: un
     ciclo con pagos conserva intactas las clases que ya tenía y suma las que se
     dicten después; lo nuevo queda como pendiente.
   - El egreso va a **Comisión** (comisiones) o **Nómina** (sueldos). Desde Egresos
     no se puede editar ni borrar: se cambia anulando el pago.
4. **Adelantos y ajustes** (R12) y ficha del instructor.

## Pruebas

- **Unitarias:** ventanas de ciclo por frecuencia y día (incluido el interruptor),
  cálculo de cada forma de pago con mínimos, alumnos mínimos y valores por
  disciplina, valor de la clase tomada (planes, combos, sueltas, cortesías).
- **Funcionales:** materialización idempotente (dos consultas no duplican), cierre y
  apertura de ciclos, reemplazos, congelado tras el primer pago, pago parcial y saldo
  anterior, pago dividido, adelanto, ajuste, anular pago y su egreso, una clase no se
  paga dos veces, aislamiento por negocio.
- **De punta a punta:** crear instructor, asignarlo al horario, ver el ciclo en
  Pagos, pagar y ver el detalle en el Historial.

## Fuera de alcance

- Acceso del instructor a su propio panel o enlace "Mis pagos" (posible spec futura,
  como el enlace Mi plan).
- Profesores de grupos de Academia.
- Dos instructores en la misma clase.
- Retenciones, seguridad social o nómina electrónica.
- Pagar por transferencia desde la app.
