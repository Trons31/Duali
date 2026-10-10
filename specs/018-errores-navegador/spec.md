# 018 · Pantalla de error que no se rompe en el navegador

**Estado:** Implementada y probada · **Fecha:** 2026-10-09

## Contexto

Las pantallas de error (`app/error.tsx`, `app/dashboard/error.tsx`,
`app/global-error.tsx`) corren en el navegador y usan `isOfflineDigest` para
decidir entre "sin conexión" y un error genérico. Esa función revisaba los
errores con `instanceof` contra las clases de Prisma. En el navegador Prisma las
reemplaza por funciones flecha (sin `prototype`), y `instanceof` lanzaba
"Function has non-object prototype 'undefined' in instanceof check", que tapaba
el error original.

## Requisitos

- **R1 — Nunca lanzar.** `safeInstanceOf` devuelve `false` (sin lanzar) si la
  clase no existe, no tiene `prototype` o falla al leerla.
- **R2 — Reconocer por nombre.** Los errores de Prisma se reconocen también por
  su `name`, que es lo que llega al navegador; con las clases reales en el
  servidor se sigue usando `instanceof`.
- **R3 — Misma decisión.** Un error de conexión (digest `DB_OFFLINE`, códigos
  P1001/P2024…, errores de red o "Can't reach database server") muestra la vista
  "sin conexión"; cualquier otro, la genérica.

- **R4 — Cliente de Prisma al día en desarrollo.** El cliente se guarda en
  `globalThis` entre recargas. Su clave incluye ahora los modelos del esquema
  (`Prisma.ModelName`), así que tras `prisma generate` con modelos nuevos se crea
  uno nuevo en vez de seguir usando el viejo (antes `prisma.paymentReceipt` era
  `undefined` en el Inicio).

## Criterios de aceptación

- [x] Con los sustitutos del navegador (función flecha, Proxy que lanza o
      `undefined`) no se lanza ningún error.
- [x] Un `PrismaClientKnownRequestError` P2024 es de conexión; uno P2002 no.
- [x] `isOfflineDigest` decide sin lanzar con digest, mensaje o `null`.
- [x] La caché de la app no reutiliza un cliente creado con otros modelos. (Si Node ya cargó el cliente viejo, hay que reiniciar `next dev` tras `prisma generate`.)

## Pruebas

Unitarias: `src/lib/db-errors.test.ts`.
