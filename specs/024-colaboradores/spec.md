# 024 · Colaboradores: instructores, administradores y socios

**Estado:** Hecha (falta correr e2e) · **Fecha:** 2026-10-10 · **Aprobada:** 2026-10-10 con las recomendaciones

## Contexto

La spec 023 creó **Instructores** en una sección EQUIPO del menú. La dueña pide
que se vea como en CliqCut: una sola página **Colaboradores** donde, además de los
instructores, pueda crear **administradores** que entren al sistema con su propio
correo y contraseña y vean solo lo que ella les permita.

Hoy en Duali solo entra la dueña (`clients`). No hay otra persona con acceso al
negocio.

## Referencias (CliqCut-Web)

| Qué | Dónde | Qué tomamos |
| --- | --- | --- |
| Página | `components/owner/BarbersClient.tsx` | Un botón "Agregar colaborador" (el tipo se elige dentro), pestañas subrayadas con contador (*Barberos · Administradores · Socios*), tarjetas por persona, "desactivados" plegados abajo |
| Modelo | `BarberShopCollaborator` (`role` PARTNER/ADMIN, `permissions` Json, `isActive`, `createdById`) | Una fila por colaborador con su rol y permisos |
| Permisos | `lib/collaborator-permissions.ts` | Lista de permisos en grupos con etiqueta y descripción; "Ver dashboard" siempre; *Realizar pagos* implica *Ver pagos*; *Editar ajustes* implica *Ver ajustes*; mapa ruta → permiso |
| Reglas | `lib/api/team.ts` `createCollaborator` | Solo la dueña crea colaboradores; correo único; contraseña de 8+; reactivar en vez de duplicar |
| Menú | `components/shared/Sidebar.tsx` | "Colaboradores" y "Pagos" como entradas propias; el colaborador no ve el plan |

## Decisiones

### D1 — Menú

La sección EQUIPO queda con dos entradas, como CliqCut:

- **Colaboradores** (`/dashboard/colaboradores`): pestañas *Instructores ·
  Administradores · Socios*.
- **Pagos** (`/dashboard/colaboradores/pagos`): los pagos a instructores (fase 3 de
  la spec 023).

`/dashboard/instructores` redirige a Colaboradores para no romper enlaces.

### D2 — Tres tipos de colaborador

| Tipo | Entra al sistema | Qué ve | Cobra |
| --- | --- | --- | --- |
| **Instructor** | No (por ahora) | — | Sí, con su forma de pago (spec 023) |
| **Administrador** | Sí | Solo lo que la dueña marque (D4) | No por Duali |
| **Socio** | Sí | Todo, menos *Mi Plan* y crear o quitar colaboradores | No por Duali |

Un instructor que además administra se registra dos veces: como instructor (para
pagarle) y como administrador (para que entre). Así no se mezcla el pago con el
acceso.

### D3 — El acceso de un colaborador

- Entra por el mismo `/auth/login` con su correo y contraseña. El correo no puede
  ser el de otro negocio ni el de otro colaborador.
- Trabaja **sobre el negocio de la dueña**: todo lo que crea queda en ese negocio.
- La cabecera del menú muestra su nombre y "Administrador" o "Socio", sin el plan
  (como CliqCut: la suscripción es de la dueña).
- **Desactivarlo** le cierra el acceso en su siguiente petición (no hay que esperar
  a que venza la sesión). Se puede reactivar.
- Solo la **dueña** crea, edita, desactiva o cambia la contraseña de los
  colaboradores. Un socio o administrador nunca puede darse más permisos.

### D4 — Permisos del administrador (adaptados a un estudio)

Se marcan en el formulario, en grupos, con la descripción de cada uno:

| Grupo | Permiso | Qué deja hacer |
| --- | --- | --- |
| Operación | **Inicio** | Siempre activo |
| | **Horario y asistencia** | Ver y cambiar el horario, reservar cupos y marcar asistencia |
| | **Avisos** | Ver y enviar avisos a clientes |
| | **Clientes y ventas** | Ver clientes, vender planes, registrar pagos de clientes, revisar comprobantes |
| | **Paquetes y precios** | Crear y editar disciplinas, paquetes y precios |
| | **Página pública y contenido** | Editar la página pública y las publicaciones |
| Equipo | **Ver colaboradores** | Ver instructores (no administradores ni socios) |
| | **Ver pagos a instructores** | Ver lo que se les debe y el historial |
| | **Realizar pagos** | Registrar pagos y adelantos a instructores (incluye *Ver pagos*) |
| Finanzas | **Egresos** | Ver y registrar egresos |
| | **Contabilidad** | Ver balances y movimientos |
| Ajustes | **Ver ajustes** | Consultar la configuración del negocio |
| | **Editar ajustes** | Cambiarla (incluye *Ver ajustes*) |
| Academia (si está activa) | **Alumnos, grupos y cobros** | Todo lo del módulo Academia |

*Mi Plan* nunca se le da a un colaborador.

### D5 — Dónde se hace cumplir

- **La API es la que manda:** cada ruta del negocio pertenece a un permiso (un mapa
  ruta → permiso, como `OWNER_PATH_PERMISSIONS`). Sin permiso responde **403**.
  Las rutas sin permiso en el mapa quedan solo para la dueña, así una ruta nueva
  que se olvide en el mapa no queda abierta.
- **El menú** oculta lo que no puede ver, y entrar por URL a una página sin permiso
  lleva a Inicio con un aviso.

## Modelo (aditivo)

- Enum `CollaboratorRole (ADMIN | SOCIO)`.
- `collaborators`: `id, clientId, nombre, email (único), celular?, passwordHash,
  rol, permisos (Json, por defecto {}), activo (true), createdById?, ultimoAcceso?,
  createdAt, updatedAt`. Índices por `clientId` y `activo`.
- El token de la API lleva, además del negocio (`sub`), el colaborador (`col`). Los
  tokens de la dueña no cambian.

## Pantallas

### Colaboradores (`/dashboard/colaboradores`)

```
Colaboradores                                      [+ Agregar colaborador]
Tu equipo y quién puede entrar al sistema
───────────────────────────────────────────────────────────────────────
 🧘 Instructores (4)   🛡 Administradores (1)   👥 Socios (0)
───────────────────────────────────────────────────────────────────────
┌──────────────────────────┐ ┌──────────────────────────┐
│ (LP) Laura Pérez         │ │ (AR) Andrés Ríos         │
│ Pilates · Rumba          │ │ Body Combat              │
│ $6.000 por alumno        │ │ $35.000 por clase        │
│ 6 horarios     [Editar]  │ │ 3 horarios     [Editar]  │
└──────────────────────────┘ └──────────────────────────┘
▸ Desactivados (1)
```

- **Instructores:** lo que hoy es la página Instructores (spec 023), igual.
- **Administradores:** tarjeta con nombre, correo, "Entró hace 2 días", cuántos
  permisos tiene ("7 de 14 permisos") y Editar / Desactivar.
- **Socios:** tarjeta con nombre, correo, último acceso y Editar / Desactivar.

### Agregar colaborador (asistente, como CliqCut)

```
Paso 1 · ¿Qué tipo de colaborador?
( ) Instructor      Dicta clases y le pagas por ellas. No entra al sistema.
( ) Administrador   Entra al sistema y ve solo lo que tú elijas.
( ) Socio           Entra al sistema y ve todo, menos tu plan.

Paso 2 · Datos   (instructor: el formulario de la spec 023)
Nombre [          ]  Celular [          ]
Correo [          ]  Contraseña [        ]  (mínimo 8)

Paso 3 · Permisos (solo administrador)
OPERACIÓN
[x] Inicio                     Siempre activo
[x] Horario y asistencia       Ver y cambiar el horario, reservas y asistencia
[ ] Clientes y ventas          …
EQUIPO
[ ] Ver pagos a instructores   …
                                          [Atrás]  [Crear administrador]
```

Al editar, la contraseña es opcional ("déjala vacía para no cambiarla").

## Requisitos

- **R1** Página Colaboradores con las tres pestañas y "Desactivados" plegado.
- **R2** Asistente "Agregar colaborador" con el tipo, los datos y los permisos.
- **R3** CRUD de administradores y socios, solo para la dueña. Correo único entre
  negocios y colaboradores; contraseña de 8 o más caracteres.
- **R4** Login de colaboradores en `/auth/login`, sobre el negocio de la dueña.
- **R5** Permisos en la API (403) con el mapa ruta → permiso; lo que no está en el
  mapa es solo de la dueña.
- **R6** Menú y páginas según los permisos; *Mi Plan* nunca.
- **R7** Desactivar corta el acceso en la siguiente petición; reactivar lo devuelve.
- **R8** `/dashboard/instructores` redirige a Colaboradores.

## Criterios de aceptación

- [ ] Un administrador con solo *Horario y asistencia* ve Inicio y Horario; la API
  de ventas le responde 403.
- [ ] *Realizar pagos* sin marcar *Ver pagos* guarda los dos.
- [ ] Un socio ve todo menos Mi Plan, y no puede crear colaboradores (403).
- [ ] Un administrador no puede editar su propio permiso ni el de otro (403).
- [ ] Desactivado, su sesión abierta recibe 401 y vuelve al login.
- [ ] Un correo ya usado por un negocio u otro colaborador se rechaza.
- [ ] Lo que crea un administrador queda en el negocio de la dueña.

## Fases

1. Modelo, login y permisos en la API (R3–R5, R7), con pruebas de cada permiso.
2. Página Colaboradores, asistente y menú (R1, R2, R6, R8).

## Pruebas

- **Unitarias:** normalización de permisos (implicaciones), mapa ruta → permiso
  (toda ruta de `src/app/api` con `requireClient` está en el mapa o es solo de la
  dueña, a propósito).
- **Funcionales:** crear, editar, desactivar y reactivar; login; 403 por permiso;
  401 tras desactivar; correo duplicado.
- **E2E:** entrar como administrador y ver solo su menú.

## Fuera de alcance

- Que el instructor entre a ver sus clases y sus pagos (como el barbero en CliqCut):
  otra spec, cuando la 023 esté completa.
- Límite de colaboradores por plan.
- Registro de quién hizo cada cambio (auditoría).

## Decisiones de la dueña (2026-10-10)

1. **Socios:** sí.
2. **Clientes y ventas** va como un solo permiso.
3. Un administrador con *Ver instructores* solo los **ve**; el socio sí los edita.

## Notas de implementación

- Las lecturas que usan varias pantallas (disciplinas, paquetes, perfil, página
  pública) son de *Inicio*, para que una página no se rompa por leer datos de otra
  sección. La lista de instructores la puede leer también quien tiene *Horario*
  (para elegir titular y reemplazo).
- Editar instructores y el ciclo de pago es de la dueña y el socio (`EQUIPO`).
- Una prueba unitaria recorre todas las rutas de `src/app/api` con
  `requireClient` y falla si alguna no está en el mapa ni en la lista de rutas
  solo de la dueña.
- Con *Ver ajustes* sin *Editar ajustes* la página se ve igual, pero guardar
  responde 403. Ocultar los botones queda pendiente.
