# 016 · Logo nuevo y estudio demo

**Estado:** Implementada y probada · **Fecha:** 2026-10-09

## Contexto

Duali estrena logo: las letras **DU**, la D en cian y la U en verde azulado sobre
azul marino. Además, el usuario demo que ya existe (`demo@gmail.com`) solo tiene Body Combat;
para mostrar el Modo Estudio necesita el catálogo real
de Studio Dance (sus historias de Instagram con precios).

## Requisitos

### Logo

- **R1 — Logo vectorial y sin fondo.** El logo se dibuja en SVG con los
  colores de la imagen original: D `#22d3ee`, U `#14b8a6`, sin baldosa (fondo
  transparente), para que quede igual sobre cualquier fondo del sistema.
- **R2 — Reemplazo total.** `BrandLogo` usa el logo nuevo en login, registro,
  admin, panel y página pública. Se regeneran `public/logo/icon.png` y
  `icon-metadata.png` (favicon, manifest, imagen para redes) y se agrega
  `icon.svg`. Las notificaciones web usan el ícono propio de la app en lugar del
  archivo viejo alojado en Cloudinary.
- **R2b — Tarjeta del negocio en el menú como Nubi** (`components/shared/Sidebar.tsx`):
  logo y nombre arriba; separado por una línea, la persona con la etiqueta del
  tipo de negocio (Academia, Estudio o Academia + Estudio) y una línea
  "Plan · Vence en N días" que pasa a ámbar a 7 días y a rojo (con punto que
  late) a 3 días o vencido.

### Estudio demo

- **R3 — Seed del estudio demo** `scripts/seed-demo-studio.ts`, aditivo e
  idempotente, en simulación salvo `--apply`:
  - Trabaja sobre el usuario demo existente (`--email` para otro); nunca crea usuarios.
  - Lleva los paquetes que ya existen con el mismo nombre al precio de las historias.
  - Agrega horario solo a las disciplinas que aún no tienen.
  - Catálogo de las historias: Body Combat, Rumba Fit, Jump Power y el combo
    Mix Studio (Rumba Fit + Jump Power + Body Combat), con los paquetes
    Individual (1), Básico (4), Plus (8), Premium (12) y Full Studiodance (20)
    por mes y sus precios. Mix Studio no tiene Individual.
  - Horario semanal, clientes de ejemplo con ventas (pagadas y con saldo),
    reservas de esta semana y la página pública publicada.
- El catálogo se comparte con `scripts/seed-studio-catalog.ts` (una sola tabla
  de precios).

## Criterios de aceptación

- [x] No queda ninguna referencia al logo anterior.
- [x] El seed corre dos veces sin duplicar nada.
- [x] Los precios del seed son exactamente los de las historias.
- [x] Sin `--apply` el seed solo lee: no escribe nada en la base.

## Fuera de alcance

- Cambiar los colores de marca de la interfaz (`brand`).

## Uso

`npm run db:seed:demo` muestra el plan sin escribir; `npm run db:seed:demo -- --apply`
escribe en la base de `DATABASE_URL`. Datos: 4 disciplinas, 19 paquetes, 11
horarios nuevos (las disciplinas que ya tenían horario lo conservan), 6 clientes,
5 ventas y reservas de los próximos días. Las reservas necesitan las migraciones
al día (`npm run db:deploy`).

## Pruebas

Funcionales: `tests/functional/demo-seed.test.ts` · E2E: el logo nuevo en el
login y la página pública.
