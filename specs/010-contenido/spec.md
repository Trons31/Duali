# 010 · Contenido: fotos, videos y portadas

**Estado:** Implementada y probada (falta aplicar migraciones en producción) · **Fecha:** 2026-10-09 · **Propuesta:** [estudio/propuesta.md](../estudio/propuesta.md)

## Contexto

El estudio publica en Instagram fotos y videos de sus clases. Quiere mostrarlos
también en su página (como un blog) y darle imagen a la página y a cada disciplina.

## Decisiones (usuario, 2026-10-09)

- **Cuenta de Cloudinary:** la misma de Nubi (`D:\MVPs\Nubi`).
- **Orden de carpetas**, como Nubi, por negocio y separando imágenes y videos:

  ```
  duali/negocios/{idNegocio}/imagenes/{publicaciones|disciplinas|portada}
  duali/negocios/{idNegocio}/videos/publicaciones
  ```

  Se usa el id del negocio (no el slug, que puede cambiar). `duali/` y
  `duali/negocios/` se crearon con `scripts/cloudinary-setup.ts`; las de cada
  negocio se crean la primera vez que sube algo.
- **D7 ampliada:** videos **subidos** (carpeta `videos/`) y también **enlaces**
  de YouTube, Instagram o TikTok.

## Cómo se sube (como Nubi: solo al guardar)

Revisión 2026-10-09 pedida por el usuario: antes el archivo se subía al elegirlo y,
si no se guardaba, quedaba huérfano en Cloudinary. Ahora se sigue el modelo de
Nubi (`SettingsClient.LogoUploader` + `uploadToCloudinary` al guardar):

1. Elegir un archivo **solo muestra una vista previa local**; no se sube nada.
2. Al **Guardar**, el panel pide `POST /api/media/signature { kind, use }`; el
   servidor firma **solo para la carpeta de ese negocio**, con formatos
   permitidos y, en imágenes, la transformación de Nubi (máx. 2000 px,
   `q_auto`). Todo lo firmado lo hace cumplir Cloudinary.
3. El navegador sube directo a Cloudinary (Nubi pasa la imagen por su servidor
   en base64; en Duali eso no sirve para videos por el límite de 4,5 MB de Vercel)
   y enseguida guarda el registro.
4. Al guardar, el servidor acepta el archivo solo si su `public_id` está en la
   carpeta de ese negocio y la URL es de la nube configurada; el archivo anterior
   se borra después de guardar (best-effort, como Nubi).
5. Si el guardado falla después de subir, el panel llama `DELETE /api/media`;
   el servidor solo lo borra si es de ese negocio y **ningún registro lo usa**.

## Modelo (aditivo)

- `content_posts` (tabla nueva): id, clientId, tipo (`PUBLICACION` | `VIDEO`),
  titulo, cuerpo?, disciplineId?, mediaUrl?, mediaPublicId?, mediaKind?
  (`IMAGEN` | `VIDEO`), enlaceVideo?, publicado (false), fijado (false),
  publicadoEn?, timestamps, deletedAt.
- `clients.portadaUrl`, `clients.portadaPublicId` (NULL): portada de la página.
- `disciplines.imagenUrl`, `disciplines.imagenPublicId` (NULL).

## Requisitos

- **R1 — Firma** `POST /api/media/signature`: solo módulo Estudio; imagen ≤ 10 MB
  (jpg, jpeg, png, webp, heic), video ≤ 100 MB (mp4, mov, webm).
- **R2 — Publicaciones** `GET/POST /api/content-posts`, `PUT/DELETE /api/content-posts/[id]`:
  - `PUBLICACION`: título y foto o texto. `VIDEO`: archivo subido **o** enlace.
  - Enlaces: solo YouTube, Instagram o TikTok; se guarda la URL y se arma el
    embebido (YouTube con `youtube-nocookie`).
  - Publicar pone `publicadoEn`; fijar la pone primero.
- **R3 — Portada y disciplinas:** `PUT /api/client/public-page { portada }` y
  `PUT /api/disciplines/[id] { imagen }` con la misma validación de carpeta.
- **R4 — Panel** `MI PÁGINA → Contenido` (`/dashboard/contenido`): tarjetas con
  miniatura, estado (borrador/publicada/fijada), crear, editar, publicar, borrar.
  En Mi página, subir portada; en cada disciplina, su imagen.
- **R5 — Página pública:** portada arriba, imagen en cada tarjeta de disciplina y
  sección **Novedades** con lo publicado (fijadas primero), video embebido o
  reproductor, y la disciplina relacionada.

## Criterios de aceptación

- [x] La firma devuelve la carpeta `duali/negocios/{miId}/imagenes/publicaciones`.
- [x] Guardar un archivo de la carpeta de otro negocio responde 422.
- [x] Un enlace de Vimeo o de un sitio cualquiera se rechaza.
- [x] Un borrador no aparece en la página pública; al publicarlo sí.
- [x] Borrar una publicación borra el archivo de Cloudinary (best-effort).
- [x] Subida real de una imagen a Cloudinary con la firma de Duali y borrado (verificación manual con la cuenta).
- [x] La migración solo crea una tabla, un enum y columnas NULL.
- [x] Elegir un archivo y cancelar no sube nada a Cloudinary (revisión 2026-10-09).
- [x] `DELETE /api/media` borra un archivo propio sin usar y rechaza uno en uso o de otro negocio.

## Pruebas

- Unitarias: `src/lib/media.test.ts` (carpetas, pertenencia, firma con transformación contra la fórmula de
  Cloudinary, enlaces de video) y `src/components/dashboard/media-uploader.test.ts` (sin red hasta guardar; lo
  pendiente se firma y sube al guardar; se descarta si el guardado falla).
- Funcionales: `tests/functional/content.test.ts` (con `DUALI_MEDIA_OFFLINE=1`: sin llamadas a Cloudinary, borrados anotados).
- E2E: novedad publicada con su video en la página pública; el borrador no aparece; pantalla Contenido.
- Cuenta real: `scripts/cloudinary-verify.ts` sube con la firma de Duali, comprueba que alterar la carpeta o el
  formato es rechazado por Cloudinary y limpia lo creado (corrido el 2026-10-09: todo OK).

## Pendientes conocidos

- El límite de 100 MB de video se valida en el navegador; Cloudinary aplica además el límite de su plan.

## Fuera de alcance

- Comprobantes de pago con foto en la reserva web (se hará con esta misma base).
- Edición de video o recortes.
- Filtrar novedades por disciplina en la página pública.
