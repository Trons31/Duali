# 008 · Página pública del estudio

**Estado:** Implementada y probada (falta aplicar migraciones en producción) · **Fecha:** 2026-10-09 · **Propuesta:** [estudio/propuesta.md](../estudio/propuesta.md)

## Contexto

Hoy el estudio comparte su menú y horario con historias de Instagram. Necesita
una página propia que muestre disciplinas, precios y horario con cupos reales, y
desde la que se pueda reservar (spec 009).

## Referencia en CliqCut

`app/barbers/booking/[shopId]/page.tsx` + `BookingWizard`: fondo oscuro
(`gray-950`), barra superior con logo y nombre, contenido `max-w-2xl`, tarjetas
`rounded-2xl border-white/10`, acento de color de marca (en Duali, `brand`).

## Decisión tomada sin confirmar (cambiable)

Dirección: **`/s/{slug}`** (ej. `/s/studiodance`). El slug se sugiere a partir
del nombre del negocio y el dueño lo puede cambiar.

## Modelo (aditivo)

`clients` gana `slug TEXT NULL UNIQUE` y `paginaPublicaActiva BOOLEAN NOT NULL DEFAULT false`.
Ningún negocio queda publicado sin que su dueño lo active.

## Requisitos

- **R1 — Slug.** 3–40 caracteres `a-z 0-9 -`, sin empezar/terminar en guion;
  único; palabras reservadas no permitidas (`admin`, `api`, `dashboard`, …).
  `PUT /api/client/public-page` `{ slug?, paginaPublicaActiva? }`; para publicar
  hace falta slug y el módulo Estudio activo. `GET` devuelve el estado y un slug
  sugerido si no tiene.
- **R2 — Página** `/s/[slug]` (pública, sin sesión; `proxy.ts` la deja pasar):
  - Solo si existe, está publicada y el negocio tiene el módulo Estudio; si no, 404.
  - Cabecera con nombre del negocio y botón de WhatsApp (teléfono del negocio).
  - **Precios:** una tarjeta por disciplina/combo activa con sus paquetes
    `activo && visiblePublico`, igual que en el panel.
  - **Horario:** próximos 7 días con cada clase, hora y "Quedan N cupos" / "Lleno"
    / "Cancelada". Nunca se muestran nombres de clientes.
  - **Cómo pagar:** los métodos de pago del negocio (Ajustes).
  - Botón **Reservar** → asistente de la spec 009.
- **R3 — Panel** `MI PÁGINA → Página pública` (`/dashboard/mi-pagina`): elegir la
  dirección, publicar/despublicar, copiar enlace, abrir y compartir por WhatsApp.
- **R4 — Metadatos** para compartir (título y descripción con el nombre del negocio).

## Criterios de aceptación

- [x] Sin publicar, `/s/{slug}` responde 404 aunque el slug exista.
- [x] Un paquete oculto o pausado no aparece en la página.
- [x] Una clase con 15 cupos y 3 reservas muestra "Quedan 12 cupos".
- [x] `admin` y `Mi Estudio!` se rechazan como slug; dos negocios no comparten slug.
- [x] La migración solo agrega dos columnas (una con DEFAULT, otra NULL) y un índice único.

## Pruebas

Unitarias: `src/lib/studio-constants.test.ts` · Funcionales: `tests/functional/public.test.ts` · E2E: página renderizada sin sesión.

## Fuera de alcance

- Logo, portada y fotos (Cloudinary, spec 010).
- Dominio propio del estudio.
