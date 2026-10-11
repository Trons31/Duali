# 029 · Seed de validación en el demo

**Estado:** Implementada y probada · **Fecha:** 2026-10-11

## Contexto

Antes de entregar Duali a un estudio, la dueña quiere recorrer en el demo
(`demo@gmail.com`) cada cosa construida en las specs 019–028 y comprobar que no
hay errores: asistencias, cobros y pagos en dos partes, pagos a instructores con
su historial y la Contabilidad el día de pago.

## Decisiones

- **D1 — Mismo contrato que el seed de la spec 016:** trabaja sobre el usuario
  que ya existe (nunca crea usuarios), es aditivo e idempotente, y sin `--apply`
  solo lee y muestra el plan.
- **D2 — Todo por la lógica de la app:** las ventas, pagos, anulaciones,
  renovaciones y egresos pasan por las rutas de la API; las reservas, la
  asistencia, los ciclos y los pagos a instructores por las mismas funciones.
- **D3 — Seis semanas de historia.** Para que existan clases y ciclos de pago
  anteriores, el seed lleva hacia atrás (nunca hacia adelante) la fecha desde la
  que cuentan los pagos a instructores y la de creación de los horarios del demo.
  Solo toca las clases sin instructor para ponerles un titular.
- **D4 — Pagos anteriores en su día de pago.** Cada pago a instructor queda
  fechado el día de pago de su ciclo. El último ciclo vencido de cada instructor
  por clases queda sin pagar, para validar el "saldo anterior" hoy.
- **D5 — No crea comprobantes.** Rechazar uno borra su imagen de Cloudinary; el
  demo ya tiene un comprobante real por revisar.

## Uso

```bash
npm run db:seed:validacion              # simulación: muestra el plan, no escribe
npm run db:seed:validacion -- --apply   # escribe en la base de DATABASE_URL
```

Requiere el estudio demo (`npm run db:seed:demo -- --apply`) y las migraciones al
día. Se puede correr las veces que sea: lo que ya existe se salta.

## Qué deja

| Escenario | Quién | Para validar |
| --------- | ----- | ------------ |
| Plan vencido sin renovar, con 5 asistencias y 1 falta | Juliana Castro | Ficha › Ver clases, Avisos (vencidos sin renovar), Renovar |
| Saldo vencido sin ningún pago y una clase de ayer sin marcar | Mariana Díaz | Cobros › Vencidos, Inicio (clase sin asistencia), Horario › Asistencia |
| Premium Mix Studio con dos abonos (uno hoy en dos partes) | Paula Herrera | Ficha › Pagos, Cobros › Pendientes, Registrar pago (resumen) |
| Plan renovado | Isabella Moreno | Ficha (historial de planes), Planes |
| Pago anulado y luego el bueno | Valeria Gil | Ficha › Pagos ("Anulado"), Cobros › Historial |
| Llegó sin reservar a una clase suelta | Gabriela Suárez | Clientes › Clases sueltas, historial de clases |
| Hoy compró dos disciplinas en una venta, pagó en dos partes | Natalia Vargas | Dos planes en la ficha, Cobros › Historial, Contabilidad › Hoy |
| Instructores: Mateo (por clase), Laura (% por alumno), Carolina (sueldo) | Equipo | Colaboradores, titulares en el Horario |
| Ciclos semanales y mensual desde hace 6 semanas, pagados total, en dos partes y parcial | Pagos | Pagos › Historial, saldo anterior, "Hoy se paga" |
| Egresos de este mes y del pasado (uno en dos partes) | Egresos | Egresos, Contabilidad › Egresos |

## Guía de validación (día de pago)

1. **Inicio:** "Para atender" muestra la clase sin asistencia, el saldo vencido y el
   comprobante por revisar.
2. **Horario › Asistencia:** marca la clase de ayer de Mariana.
3. **Cobros:** Pendientes (Paula, Mariana), Vencidos (Mariana), Por revisar (el
   comprobante real), Historial filtrado por Nequi (incluye los pagos en dos partes).
4. **Registrar pago** a Paula desde Cobros: resumen → "Pago en dos partes".
5. **Vender paquetes** a Juliana: dos disciplinas, abono parcial, fecha límite.
6. **Pagos (instructores):** el ciclo de comisiones dice "Hoy se paga"; Mateo y
   Laura tienen saldo anterior. Págale a Mateo en dos partes.
7. **Contabilidad › Hoy:** el pago a Mateo aparece en "Pagos a instructores" y en
   Egresos con "Pago registrado"; Ingresos de hoy incluye la venta de Natalia y el
   abono de Paula por método. **Mes pasado** y **Ciclo de pago** muestran los pagos
   anteriores a instructores.
8. **Egresos:** registra uno en dos partes y míralo en Contabilidad.

## Pruebas

- `tests/functional/demo-validation.test.ts`: sin el estudio demo no escribe;
  la simulación no escribe; al aplicar deja cada escenario (asistencias, saldo
  vencido, anulado, dos partes, renovación, ciclos y pagos anteriores, saldo para
  hoy) y repetirlo no duplica nada.
- `tests/e2e/demo-validation.e2e.test.ts`: con el demo sembrado, las 40 pantallas
  del panel (cada ficha, cada pestaña de Cobros, cada filtro de Contabilidad)
  abren en Chromium sin pantalla de error ni errores de consola.
