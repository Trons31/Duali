# 021 · Comprar un plan en línea y reservar con él

**Estado:** Implementada · **Fecha:** 2026-10-09

## Contexto

En la página pública, **Elegir este plan** lleva a `/s/{slug}/reservar?plan=…`, que
es el asistente de *reservar una clase*: pide primero el día y la hora. El plan solo
se usa si la persona termina reservando una clase y, además, se vende **sin pago**
(spec 009 D5). El comprobante se puede subir después, desde el enlace de esa
reserva (spec 014). Quedan tres problemas:

1. **No se puede comprar un plan sin reservar una clase.** Quien quiere "el plan de
   8 clases" termina en un calendario.
2. **El pago queda suelto.** No hay un paso de pago en el flujo: se reserva primero
   y el comprobante es opcional y posterior. CliqCut lo resuelve dentro del flujo:
   muestra las cuentas con **Copiar**, pide el comprobante y la dueña lo valida
   (aceptar o rechazar).
3. **Quien ya compró no ve lo que tiene.** Al reservar con su plan solo se entera de
   cuántas clases le quedan después de reservar, y no tiene dónde ver su plan, sus
   reservas ni el estado de su pago.

## Referencias

- **CliqCut** `components/public/steps/PaymentStep.tsx` (pagar para reservar:
  métodos con número y **Copiar**, subir comprobante con validación de tipo y
  peso, y no deja seguir sin él), `components/appointments/PendingPaymentReviewGrid.tsx`
  y `PATCH /api/appointments/[id]/review-payment` (la dueña acepta o rechaza).
- **Duali specs 009, 012, 014 y 015**: asistente público, identidad por celular +
  nombre, enlace privado con token, comprobantes en Cloudinary y su revisión.

## Decisiones (recomendadas)

- **D1 — Dos caminos separados en la página pública:**
  - **Elegir este plan** → *Comprar plan*: Plan → Tus datos → Pago → Listo. No
    pide clase.
  - **Reservar clase** → igual que hoy (Clase → Tus datos → …), pero con el paso
    Pago adentro cuando hace falta comprar (D5).
- **D2 — El comprobante es parte de la compra** (como CliqCut): sin comprobante no
  se termina de comprar. El estudio puede activar en Ajustes **"Permitir pagar en el
  estudio"**: aparece la opción *Pago en el estudio* y la compra queda debiendo,
  como hoy.
- **D3 — Se puede reservar mientras la dueña valida el pago.** El plan comprado en
  línea queda **Pago en revisión** y sirve para reservar de una vez (no pierde el
  cupo). Si la dueña rechaza el comprobante, el plan queda **debiendo** con el
  motivo a la vista, y la clienta puede subir otro (máximo 3, spec 014). Las
  reservas no se cancelan solas: la dueña decide (puede anular la venta, lo que ya
  exige cancelar sus reservas, spec 007 R4).
  Opción en Ajustes, apagada por defecto: **"Esperar a validar el pago para
  reservar"**.
- **D4 — "Mi plan", un enlace privado por plan** (como el de la reserva, spec 009):
  `/s/{slug}/plan/{token}` muestra el plan, cuántas clases le quedan y cuántas
  usó, el vencimiento, sus reservas, el estado del pago con sus comprobantes y el
  botón **Reservar con este plan**. No hay "buscar por celular", porque dejaría ver
  el plan de otra persona.
- **D5 — Reservar con plan muestra lo que tiene antes de confirmar.** Si el celular
  y el nombre coinciden (regla de spec 009) y hay un plan vigente que sirve para la
  clase, el paso Confirmar dice "Plus Mix Studio · te quedan 6 de 8 · vence 7 nov"
  y "después de esta reserva te quedarán 5". Si no tiene plan, elige uno o la clase
  suelta y pasa por Pago, en el mismo asistente.
- **D6 — El plan empieza el día de la compra** y vence según los días del paquete
  (`vigenciaDias`), como en el panel.
- **D7 — Límite contra abuso:** un celular no puede tener más de **2 compras en
  línea sin pago aprobado** al mismo tiempo. La tercera responde "Ya tienes compras
  esperando que el estudio valide el pago. Escríbele al estudio."

## Modelo (aditivo)

- `member_packages.origen TEXT NOT NULL DEFAULT 'PANEL'` (`PANEL` | `PUBLICO`).
- `member_packages.accessToken TEXT NULL UNIQUE`: enlace de "Mi plan" (D4). Se crea
  en las compras en línea, y la dueña puede generarlo para cualquier plan (R10).
- `payment_receipts.bookingId` ya es opcional: un comprobante puede ser de un plan
  sin reserva. `payment_receipts.metodoPago TEXT NULL`: el método que eligió la
  clienta, para preseleccionarlo al aprobar.
- `clients.permitirPagoEnEstudio BOOLEAN NOT NULL DEFAULT false` (D2).
- `clients.exigirPagoValidado BOOLEAN NOT NULL DEFAULT false` (D3).

Nada se renombra ni se borra.

## Pantallas (celular primero; en computador, la misma columna centrada)

### Comprar plan

```
← Volver                         PASO 1 DE 3 · TUS DATOS
▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱
┌────────────────────────────────────────┐
│ Plus · Mix Studio                       │
│ 8 clases · 30 días · $120.000   Cambiar │
└────────────────────────────────────────┘
Tus datos
Celular   [ 300 000 0102 ]
Nombre    [ Valentina ]   Apellido [ Ruiz ]
Si ya eres clienta, usa el mismo celular y nombre.
                                   [ Continuar ]
```

```
PASO 2 DE 3 · PAGO
Paga tu plan
Total $120.000
┌────────────────────────────────────────┐
│ ◉ Nequi        300 123 4567   [Copiar] │
│ ○ Bancolombia  Ahorros 123-456  [Copiar]│
│ ○ Pago en el estudio (si el estudio lo │
│   permite)                              │
└────────────────────────────────────────┘
Comprobante
┌ - - - - - - - - - - - - - - - - - - - -┐
│  Sube la foto o captura del pago       │
│  JPG, PNG o WebP · hasta 4 MB          │
└ - - - - - - - - - - - - - - - - - - - -┘
               [ Enviar y comprar plan ]
```

```
PASO 3 DE 3 · LISTO
¡Tu plan está listo!
Plus · Mix Studio · 8 clases · vence 8 nov
● Pago en revisión: el estudio validará tu comprobante.
[ Reservar mi primera clase ]
[ Guardar Mi plan ]  ← enlace privado, con WhatsApp para guardarlo
```

### Reservar clase con plan (D5)

```
PASO 3 DE 3 · CONFIRMAR
Jump Power · mar 13 oct · 6:00 p. m.
┌────────────────────────────────────────┐
│ Tu plan: Plus · Mix Studio              │
│ Te quedan 6 de 8 · vence 7 nov          │
│ Después de esta reserva te quedarán 5.  │
└────────────────────────────────────────┘
            [ Reservar con mi plan ]
```

### Mi plan (D4)

```
Plus · Mix Studio                    Vigente
Te quedan 5 de 8      ▰▰▰▱▱▱▱▱   vence 7 nov
2 asistió · 1 reservada · 5 disponibles
Pago: ● En revisión · $120.000 (Nequi, 9 oct)
[ Reservar con este plan ]
Próximas reservas
  mar 13 · Jump Power 6:00 p. m.   Gestionar ›
Historial
  jue 8 · Rumba Fit · Asistió
```

## Requisitos

### A. Comprar plan en línea

- **R1 — Asistente Comprar plan** en `/s/{slug}/comprar?p={packageId}` (D1). Solo
  paquetes `activo && visiblePublico`. Si el paquete no existe o está oculto, va a
  la sección de planes. Los enlaces viejos `/reservar?plan=` redirigen aquí.
- **R2 — Paso Pago** (D2), compartido con Reservar clase:
  - Muestra los métodos del estudio (`paymentMethodItems`) con **Copiar**.
  - Valida el comprobante en el navegador (JPG, PNG o WebP, como CliqCut), lo
    reduce a JPEG de 1600 px y solo lo envía al confirmar (spec 014: elegir la foto
    no sube nada).
  - Sin métodos configurados y sin pago en el estudio, el plan no se vende en
    línea y el botón dice "Escríbele al estudio".
- **R3 — Comprar** `POST /api/public/studios/[slug]/plans`
  `{ packageId, celular, nombre, apellido?, pago: { tipo: "COMPROBANTE", comprobante, metodo } | { tipo: "EN_ESTUDIO" } }`:
  - Identidad con la regla de spec 009 (crea la clienta o exige que el nombre
    coincida).
  - Crea la venta (`origen PUBLICO`, `accessToken`) y el comprobante POR_REVISAR,
    en una sola transacción.
  - Aplica D7. Responde el plan, su enlace y el estado del pago.
- **R4 — Subida del comprobante desde el servidor:** la foto viaja con la compra
  (data URL, máximo 4 MB) y la sube el servidor a
  `duali/negocios/{id}/imagenes/comprobantes` **después** de validar la compra; si
  la venta o la reserva fallan, la foto se borra. Así no hay una firma de subida
  pública sin token ni fotos huérfanas, y no hace falta limpiar con un cron.

### B. Reservar con plan

- **R5 — Paso Confirmar con el plan** (D5): `POST /api/public/studios/[slug]/bookings`
  acepta `{ ..., vistaPrevia: true }`, que valida todo, no reserva y devuelve el
  plan que se usaría con `clasesRestantes`, `clases` y `vence`.
- **R6 — Comprar dentro de Reservar clase:** sin plan, la clienta elige plan o clase
  suelta y pasa por el paso Pago (R2). La venta y la reserva se crean juntas, con el
  comprobante.
- **R7 — Con "Esperar a validar el pago"** (D3), un plan en revisión no reserva:
  "Tu pago está en revisión. Podrás reservar cuando el estudio lo valide."

### C. Mi plan

- **R8 — Página Mi plan** `/s/{slug}/plan/{token}` y `GET /api/public/plans/[token]`:
  plan, uso (la misma barra de spec 019 R8), vencimiento, reservas próximas con
  enlace a cada una, historial y pago (estado, comprobantes, motivo de rechazo).
  Un token inventado responde 404.
- **R9 — Reservar desde Mi plan:** abre Reservar clase con la identidad del token,
  sin volver a pedir los datos, y solo con las clases donde sirve el plan.
- **R10 — Panel:** en la ficha, cada plan tiene **Enviar Mi plan por WhatsApp**
  (crea el token si no existe), para clientas que compraron en el estudio o
  perdieron el enlace.

### D. Validación en el panel

- **R11 — Comprobantes por revisar** (Avisos, ficha e Inicio, spec 014) incluyen las
  compras en línea con la etiqueta "Compró en línea", el plan y el método que eligió
  la clienta, preseleccionado. Aprobar registra el pago (como hoy). Rechazar pide un
  motivo, que la clienta ve en Mi plan.
- **R12 — Clientes › Planes** suma el filtro **Pago en revisión**, y la tarjeta
  muestra "Compró en línea".
- **R13 — Aviso a la dueña:** "Valentina compró Plus · Mix Studio y envió su
  comprobante" (push de spec 011, abre la ficha).
- **R14 — Ajustes › Pagos en línea:** "Permitir pagar en el estudio" (D2) y "Esperar
  a validar el pago para reservar" (D3), con el texto de qué pasa en cada caso.

## Estados del pago de una venta (calculados)

| Estado | Cuándo |
| --- | --- |
| Pagado | saldo 0 |
| En revisión | saldo > 0 y algún comprobante POR_REVISAR |
| Rechazado | saldo > 0, el último comprobante RECHAZADO y ninguno por revisar |
| Pago en el estudio | saldo > 0, compra en línea sin comprobante (D2) |
| Debe | saldo > 0 en los demás casos |

## Criterios de aceptación

- [x] **Elegir este plan** abre Comprar plan sin pedir clase.
- [x] Sin comprobante no se puede comprar, salvo con "Permitir pagar en el estudio".
- [x] La compra crea venta, comprobante y enlace Mi plan juntos; si algo falla, no queda nada.
- [x] Con un plan en revisión se puede reservar, y no se puede si está activo "Esperar a validar".
- [x] Al reservar con plan, antes de confirmar se ve "te quedan X de Y" y cuántas quedarán.
- [x] Mi plan muestra el uso, las reservas y el estado del pago; un token inventado da 404.
- [x] Aprobar baja el saldo y Mi plan dice Pagado; rechazar muestra el motivo y deja subir otro.
- [x] La tercera compra pendiente del mismo celular se rechaza.
- [x] Un comprobante de otra carpeta o de otro negocio se rechaza.
- [x] La migración solo agrega columnas nulas o con default.

## Fases de implementación

1. **Modelo, compra y pago** (R1–R4, migración).
2. **Mi plan** (R8–R10).
3. **Reservar con plan y comprar dentro de Reservar** (R5–R7).
4. **Panel y ajustes** (R11–R14).

## Pruebas

- **Unitarias:** estado del pago, reglas de D3 y D7, validación del archivo.
- **Funcionales:** comprar con y sin comprobante, nombre que no coincide, tope D7,
  carpeta ajena, vista previa sin efectos, reservar en revisión con la opción
  apagada y encendida, aprobar y rechazar, token inventado, aislamiento por negocio.
- **De punta a punta:** comprar plan → Mi plan → reservar con el plan; Elegir este
  plan ya no abre el calendario.

## Fuera de alcance

- Pasarela de pago (Wompi, PSE, tarjeta): el pago sigue siendo por transferencia
  con comprobante.
- Leer el monto del comprobante automáticamente (OCR).
- Cuenta con contraseña o código por WhatsApp para la clienta.
- Renovar desde Mi plan (va con la spec 020, R3).

## Notas de implementación

- **Lista de espera:** quien se anota con un plan elegido no paga al anotarse
  (spec 015: "no se te cobra nada mientras esperas"). Si le llega el cupo, la venta
  queda debiendo como antes, y la paga con el comprobante desde su reserva o Mi plan.
- **Rechazar** exige escribir el motivo en el panel, porque la clienta lo ve en Mi plan.
- `situacionPago` (estado del pago) convive con el `estadoPago` de spec 006
  (pagado, parcial o pendiente), que mide solo el monto.
