# Propuesta · Modo Estudio (paquetes, cupos, clases sueltas y página pública)

**Estado:** Aprobada (D1–D9 OK, 2026-10-09; D8 sin definir → módulo disponible para todos) · **Fecha:** 2026-10-09

## 1. Qué pide el negocio

Un cliente nuevo (estudio de baile/fitness) trabaja distinto a una academia:

| Hoy en Duali (Academia)                          | Lo que necesita el Estudio                                    |
| ------------------------------------------------ | ------------------------------------------------------------- |
| La estudiante pertenece a **un grupo** fijo      | La persona reserva **cupo en una clase** concreta (día y hora) |
| Paga una **mensualidad** fija del grupo          | Compra un **paquete de N clases/mes**, o paga una clase suelta |
| Precio por grupo o por estudiante                | Precio por **disciplina × paquete** (tabla de precios)         |
| Todo lo maneja el dueño desde el panel           | La clienta **ve planes, horarios y reserva** desde una página pública |
| —                                                | Publica **videos y novedades** (tipo blog)                     |

### Catálogo real (Instagram del cliente)

| Paquete           | Clases/mes | Body Combat | Rumba Fit | Jump Power | Mix Studio* |
| ----------------- | ---------- | ----------- | --------- | ---------- | ----------- |
| Individual        | 1 (suelta) | 15.000      | 15.000    | 18.000     | —           |
| Básico            | 4          | 55.000      | 55.000    | 65.000     | 60.000      |
| Plus              | 8          | 110.000     | 110.000   | 130.000    | 120.000     |
| Premium           | 12         | 160.000     | 160.000   | 180.000    | 170.000     |
| Full Studiodance  | 20         | 270.000     | 270.000   | 320.000    | 290.000     |

\* Mix Studio = Rumba Fit + Jump Power + Body Combat: las clases del paquete sirven para cualquiera de las tres.

Conclusión del modelo: un **paquete** = nombre + cantidad de clases + precio + **disciplinas en las que se puede usar**. "Mix" no es una disciplina, es un paquete que habilita varias. La "Individual" es un paquete de 1 clase (la clase suelta/diaria).

## 2. Principio de diseño

- **No romper la Academia.** Lo nuevo es un *módulo* que el negocio activa en Ajustes (igual que CliqCut activa "Venta de productos"). Un negocio puede usar Academia, Estudio o ambos.
- **CliqCut es la regla visual** (spec 001): la página pública copia la estructura de `reservar/[shopId]` + `BookingWizard`; las secciones de Ajustes copian `ModeOption` y las tarjetas con guardado propio.
- **Sin pasarela de pago** al inicio: igual que CliqCut, la clienta paga por transferencia/QR a los métodos de pago del negocio y el dueño confirma.

## 3. Sidebar propuesto

Las secciones aparecen según los módulos activos. Con ambos módulos:

```
PRINCIPAL      Inicio · Notificaciones
AGENDA         Horario de clases · Reservas · Asistencia          ← Estudio
ACADEMIA       Estudiantes · Grupos                                ← Academia
VENTAS         Paquetes · Paquetes vendidos · Clases sueltas      ← Estudio
COBROS         Pagos · Pendientes · Vencidos · Inscripciones       ← Academia
FINANZAS       Egresos · Contabilidad
MI PÁGINA      Página pública · Contenido                          ← Estudio
CUENTA         Ajustes · Mi Plan
```

- Solo Estudio: desaparecen ACADEMIA y COBROS (los cobros del estudio viven en VENTAS).
- "Estudiantes" se muestra como **Alumnos** (solo el texto).
- **Implementado (fase 1):** AGENDA → Horario de clases (reservas y asistencia
  viven dentro del detalle de cada clase, no en páginas aparte); VENTAS →
  Clientes · Paquetes vendidos · Paquetes y precios. Los clientes del estudio
  son una lista propia (D1 revisada).

## 4. Modelo de datos propuesto

```
Discipline        disciplina (Body Combat, Rumba Fit, Jump Power)
  id, clientId, nombre, descripcion, color, portadaUrl, activa, orden

Package           paquete vendible
  id, clientId, nombre ("Básico"), clases (4), precio, vigenciaDias (30),
  esSuelta (bool), visiblePublico, activo, orden
PackageDiscipline (packageId, disciplineId)  ← Mix = varias filas

ClassSchedule     horario semanal recurrente
  id, clientId, disciplineId, diaSemana, horaInicio, duracionMin,
  cupo (capacidad), instructor?, activo
ClassSession      una clase concreta en una fecha (se crea al primer uso)
  id, scheduleId, fecha, cupo, cancelada, motivo
  @@unique(scheduleId, fecha)

StudentPackage    paquete comprado por un alumno
  id, clientId, studentId, packageId, precioPagado, clasesTotales,
  clasesUsadas, inicio, vence, estado (PENDIENTE_PAGO|ACTIVO|AGOTADO|VENCIDO|ANULADO)
  + abonos reutilizando PaymentInstallment (ya existe)

Booking           reserva de cupo
  id, sessionId, studentId, studentPackageId?, origen (PANEL|PUBLICO),
  estado (RESERVADA|ASISTIO|NO_ASISTIO|CANCELADA), canceladaEn
  @@unique(sessionId, studentId)

ContentPost       videos y publicaciones
  id, clientId, tipo (VIDEO|PUBLICACION), titulo, cuerpo, videoUrl,
  imagenUrl, disciplineId?, publicado, fijado, publicadoEn

Client (+)        slug (URL pública), modulos { academia, estudio },
                  politicas de reserva (plazo cancelar, reservas por día…)
Student (cambia)  grupoId y edad pasan a opcionales; + email?
```

Las reservas descuentan del paquete con una transacción que valida cupo libre y clases disponibles (evita sobrecupo cuando dos personas reservan a la vez).

## 5. Specs propuestas

### Fase 1 — Operar el estudio desde el panel (lo que el cliente necesita ya)

| #   | Spec | Qué entrega |
| --- | ---- | ----------- |
| 002 | **Módulos del negocio y sidebar** | Ajustes → tarjeta "Tipo de negocio" (Academia / Estudio / Ambos, estilo `ModeOption`). El sidebar se arma según módulos (sección 3). Renombrar Estudiantes → Alumnos. |
| 003 | **Disciplinas** | CRUD de disciplinas con color y descripción. Pantalla dentro de VENTAS → Paquetes (pestaña "Disciplinas"). |
| 004 | **Paquetes y precios** | CRUD de paquetes: clases, precio, vigencia, disciplinas habilitadas (Mix = varias), "clase suelta". Vista en tabla disciplina × paquete como la del Instagram. Carga inicial con el catálogo de arriba. |
| 005 | **Horario de clases y cupos** | Horario semanal (disciplina, día, hora, duración, cupo). Vista de semana con ocupación "8/15". Cancelar una clase puntual (feriado) y avisar a las reservadas. |
| 006 | **Venta de paquetes** | Vender un paquete a un alumno (pago total o abonos), saldo de clases, vencimiento, renovar. Estados y alertas "le quedan 2 clases" / "vence en 3 días". Entra a Contabilidad como ingreso. |
| 007 | **Reservas, asistencia y clase suelta** | Desde el panel: reservar cupo a un alumno (descuenta clase), cancelar (devuelve si es antes del plazo), pasar asistencia en la clase, y cobrar una clase suelta a alguien sin paquete. |

### Fase 2 — La clienta reserva sola

| #   | Spec | Qué entrega |
| --- | ---- | ----------- |
| 008 | **Página pública del estudio** | `duali.app/s/{slug}`: portada, disciplinas, tabla de precios, horario con cupos disponibles, métodos de pago, WhatsApp. Botón "Compartir" en el panel (MI PÁGINA → Página pública). Base visual: `reservar/[shopId]` de CliqCut. |
| 009 | **Reserva pública de cupos** | Wizard estilo `BookingWizard`: disciplina → clase/fecha → datos (celular) → confirmar. Si tiene paquete activo descuenta; si no, elige comprar paquete o clase suelta y sube comprobante; el dueño confirma. "Mis reservas" por celular para ver/cancelar (estilo `ClientAppointmentAccess`). |

### Fase 3 — Contenido y fidelización

| #   | Spec | Qué entrega |
| --- | ---- | ----------- |
| 010 | **Contenido: videos y publicaciones** | MI PÁGINA → Contenido: publicar videos (enlace de YouTube / Instagram / TikTok, embebido) y publicaciones con imagen y texto. Se muestran en la página pública como un blog, filtrables por disciplina. |
| 011 | **Notificaciones del estudio** | Recordatorio de clase (2 h antes), paquete por vencer / clases por agotarse, cupo liberado (lista de espera, opcional), clase cancelada. Reusa el outbox de notificaciones y WhatsApp que ya existen. |

Orden sugerido: 002 → 003 → 004 → 005 → 006 → 007 (cliente ya puede operar) → 008 → 009 → 010 → 011. Cada spec se escribe en detalle (requisitos + criterios de aceptación, como la 001) justo antes de implementarla.

## 6. Decisiones que necesito que valides

| #  | Pregunta | Mi recomendación |
| -- | -------- | ---------------- |
| D1 | ¿Alumnos del estudio en la misma tabla que los estudiantes de la academia? | ~~Sí, una sola lista~~ → **Revisada 2026-10-09: tabla propia `studio_members`** (identificada por celular, enlace opcional a la ficha de la Academia). Motivo: 91 referencias en 28 archivos de la Academia asumen grupo obligatorio; cambiarlo en producción era riesgoso. Aprobado por el usuario. |
| D2 | ¿Cuándo se descuenta la clase? | **Al reservar**. Si cancela antes del plazo (ej. 2 h) se devuelve; si no asiste, se pierde. |
| D3 | Vigencia del paquete "/men" | **30 días desde que se activa** (configurable por paquete), no mes calendario. |
| D4 | Clases no usadas al vencer | **Se pierden.** Opcional: el dueño puede extender la fecha manualmente. |
| D5 | ¿La clienta puede reservar desde la web sin haber pagado? | **Sí, queda "pendiente de pago"** y el dueño la confirma al ver el comprobante; el cupo se aparta igual. |
| D6 | ¿Cómo se identifica la clienta en la página pública? | **Celular + nombre**, sin contraseña (como CliqCut). Fase 2 puede agregar código por WhatsApp. |
| D7 | Imágenes (portadas, publicaciones, comprobantes) | **Cloudinary**, como CliqCut. Duali hoy no guarda imágenes. Los videos solo como enlace. |
| D8 | ¿El módulo Estudio es parte de un plan de Duali más caro? | A definir por ti (afecta "Mi Plan"). |
| D9 | ¿Hace falta registrar instructor por clase? | **No en fase 1**; campo de texto opcional en el horario. |

## 7. Riesgos

- **Sobrecupo** por reservas simultáneas → transacción con verificación de cupo (spec 007/009).
- **Cambiar `Student`** (grupo/edad opcionales) toca pantallas de la academia → migración sin pérdida y pruebas de las vistas actuales en la spec 002.
- **Página pública** expone datos → solo se publica lo marcado como visible; nunca datos de alumnos.
