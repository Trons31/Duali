// Spec 010: archivos en Cloudinary por negocio, publicaciones, portada e imagen de disciplina.
import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";
import * as mediaRoute from "@/app/api/media/route";
import * as signatureRoute from "@/app/api/media/signature/route";
import * as postsRoute from "@/app/api/content-posts/route";
import * as postRoute from "@/app/api/content-posts/[id]/route";
import * as publicPageRoute from "@/app/api/client/public-page/route";
import * as disciplineRoute from "@/app/api/disciplines/[id]/route";
import { offlineDeletions } from "@/lib/cloudinary";
import { listPublishedPosts } from "@/lib/content";
import { getPublicCatalog } from "@/lib/public-studio";
import { call, createBusiness, disconnect, expectError, expectOk, prisma } from "./helpers";
import { createCatalog } from "./studio-fixtures";

after(disconnect);
beforeEach(() => {
  offlineDeletions.length = 0;
});

let fileCounter = 0;

/** Lo que devolveria Cloudinary al subir un archivo a esa carpeta. */
function uploaded(clientId: string, kind: "imagenes" | "videos", use = "publicaciones") {
  fileCounter += 1;
  const publicId = `duali/negocios/${clientId}/${kind}/${use}/archivo${fileCounter}`;
  const type = kind === "videos" ? "video" : "image";
  return { url: `https://res.cloudinary.com/duali-test/${type}/upload/v1712/${publicId}.${type === "video" ? "mp4" : "jpg"}`, publicId };
}

type Post = { id: string; publicado: boolean; publicadoEn: string | null; mediaPublicId: string | null; embed: { provider: string; url: string } | null };

describe("spec 010 · firma de subidas", () => {
  test("firma para la carpeta del propio negocio", async () => {
    const { client, token } = await createBusiness();
    const signed = expectOk<{ folder: string; uploadUrl: string; signature: string }>(
      await call(signatureRoute.POST, { token, method: "POST", body: { kind: "IMAGEN", use: "publicaciones" } })
    );
    assert.equal(signed.folder, `duali/negocios/${client.id}/imagenes/publicaciones`);
    assert.match(signed.uploadUrl, /duali-test\/image\/upload$/);
    assert.match(signed.signature, /^[a-f0-9]{40}$/);

    const video = expectOk<{ folder: string }>(
      await call(signatureRoute.POST, { token, method: "POST", body: { kind: "VIDEO", use: "publicaciones" } })
    );
    assert.equal(video.folder, `duali/negocios/${client.id}/videos/publicaciones`);
  });

  test("sin módulo Estudio no firma; un uso desconocido se rechaza", async () => {
    const academia = await createBusiness({ moduloEstudio: false });
    expectError(await call(signatureRoute.POST, { token: academia.token, method: "POST", body: { kind: "IMAGEN", use: "portada" } }), 403);
    const { token } = await createBusiness();
    expectError(await call(signatureRoute.POST, { token, method: "POST", body: { kind: "IMAGEN", use: "../otro" } }), 422);
  });
});

describe("spec 010 · publicaciones", () => {
  test("foto: borrador no sale en la página; al publicar sí, con su fecha", async () => {
    const { client, token } = await createBusiness();
    const post = expectOk<Post>(
      await call(postsRoute.POST, {
        token,
        method: "POST",
        body: { tipo: "PUBLICACION", titulo: "Nueva clase de Jump", cuerpo: "Desde el lunes", media: uploaded(client.id, "imagenes") }
      }),
      201
    );
    assert.equal(post.publicado, false);
    assert.equal((await listPublishedPosts(client.id)).length, 0);

    const published = expectOk<Post>(await call(postRoute.PUT, { token, method: "PUT", params: { id: post.id }, body: { publicado: true } }));
    assert.ok(published.publicadoEn);
    assert.equal((await listPublishedPosts(client.id)).length, 1);

    // Editar el título no cambia la fecha de publicación.
    const edited = expectOk<Post>(await call(postRoute.PUT, { token, method: "PUT", params: { id: post.id }, body: { titulo: "Jump Power" } }));
    assert.equal(edited.publicadoEn, published.publicadoEn);
  });

  test("un archivo de la carpeta de otro negocio se rechaza", async () => {
    const { token } = await createBusiness();
    const other = await createBusiness();
    expectError(
      await call(postsRoute.POST, {
        token,
        method: "POST",
        body: { tipo: "PUBLICACION", titulo: "Robada", media: uploaded(other.client.id, "imagenes") }
      }),
      422,
      /no pertenece/
    );
  });

  test("una foto en una publicación de video, o un video como foto, se rechaza", async () => {
    const { client, token } = await createBusiness();
    expectError(
      await call(postsRoute.POST, { token, method: "POST", body: { tipo: "VIDEO", titulo: "Clase", media: uploaded(client.id, "imagenes") } }),
      422
    );
    expectError(
      await call(postsRoute.POST, { token, method: "POST", body: { tipo: "PUBLICACION", titulo: "Clase", media: uploaded(client.id, "videos") } }),
      422
    );
  });

  test("video: archivo subido o enlace, uno de los dos", async () => {
    const { client, token } = await createBusiness();
    const uploadedVideo = expectOk<Post>(
      await call(postsRoute.POST, { token, method: "POST", body: { tipo: "VIDEO", titulo: "Clase", media: uploaded(client.id, "videos") } }),
      201
    );
    assert.ok(uploadedVideo.mediaPublicId?.includes("/videos/publicaciones/"));

    const linked = expectOk<Post>(
      await call(postsRoute.POST, {
        token,
        method: "POST",
        body: { tipo: "VIDEO", titulo: "Reel", enlaceVideo: "https://www.instagram.com/reel/C8abcDEF12/?igsh=x" }
      }),
      201
    );
    assert.deepEqual(linked.embed, { provider: "instagram", url: "https://www.instagram.com/reel/C8abcDEF12/embed" });

    expectError(await call(postsRoute.POST, { token, method: "POST", body: { tipo: "VIDEO", titulo: "Nada" } }), 422, /uno de los dos/);
    expectError(
      await call(postsRoute.POST, {
        token,
        method: "POST",
        body: { tipo: "VIDEO", titulo: "Ambos", media: uploaded(client.id, "videos"), enlaceVideo: "https://youtu.be/dQw4w9WgXcQ" }
      }),
      422
    );
  });

  test("enlaces de Vimeo u otros sitios se rechazan", async () => {
    const { token } = await createBusiness();
    for (const enlaceVideo of ["https://vimeo.com/123456", "https://evil.com/watch?v=dQw4w9WgXcQ", "javascript:alert(1)"]) {
      expectError(await call(postsRoute.POST, { token, method: "POST", body: { tipo: "VIDEO", titulo: "Clase", enlaceVideo } }), 422);
    }
  });

  test("reemplazar o quitar la foto borra la anterior de Cloudinary", async () => {
    const { client, token } = await createBusiness();
    const first = uploaded(client.id, "imagenes");
    const post = expectOk<Post>(
      await call(postsRoute.POST, { token, method: "POST", body: { tipo: "PUBLICACION", titulo: "Foto", media: first } }),
      201
    );
    const second = uploaded(client.id, "imagenes");
    await call(postRoute.PUT, { token, method: "PUT", params: { id: post.id }, body: { media: second } });
    assert.deepEqual(offlineDeletions, [first.publicId]);

    // Cambiar solo el título no toca el archivo.
    await call(postRoute.PUT, { token, method: "PUT", params: { id: post.id }, body: { titulo: "Otra" } });
    assert.deepEqual(offlineDeletions, [first.publicId]);
  });

  test("borrar la publicación la saca de la página y borra su archivo", async () => {
    const { client, token } = await createBusiness();
    const media = uploaded(client.id, "videos");
    const post = expectOk<Post>(
      await call(postsRoute.POST, { token, method: "POST", body: { tipo: "VIDEO", titulo: "Clase", media, publicado: true } }),
      201
    );
    assert.equal((await call(postRoute.DELETE, { token, method: "DELETE", params: { id: post.id } })).status, 204);
    assert.deepEqual(offlineDeletions, [media.publicId]);
    assert.equal((await listPublishedPosts(client.id)).length, 0);
    expectError(await call(postRoute.PUT, { token, method: "PUT", params: { id: post.id }, body: { titulo: "x" } }), 404);
  });

  test("fijadas primero; las de otro negocio no se ven ni se editan", async () => {
    const { client, token } = await createBusiness();
    const other = await createBusiness();
    const make = async (titulo: string, fijado = false) =>
      expectOk<Post>(
        await call(postsRoute.POST, { token, method: "POST", body: { tipo: "PUBLICACION", titulo, cuerpo: "Texto", publicado: true, fijado } }),
        201
      );
    await make("Primera");
    const pinned = await make("Fijada", true);
    await make("Última");
    const list = await listPublishedPosts(client.id);
    assert.equal(list[0].id, pinned.id);

    expectError(await call(postRoute.PUT, { token: other.token, method: "PUT", params: { id: pinned.id }, body: { titulo: "Hack" } }), 404);
    assert.equal((await listPublishedPosts(other.client.id)).length, 0);
  });

  test("la disciplina debe ser del negocio", async () => {
    const { token } = await createBusiness();
    const other = await createBusiness();
    const { disciplines } = await createCatalog(other.token);
    expectError(
      await call(postsRoute.POST, {
        token,
        method: "POST",
        body: { tipo: "PUBLICACION", titulo: "Clase", cuerpo: "x", disciplineId: disciplines.jump }
      }),
      422
    );
  });
});

describe("spec 010 · portada e imagen de disciplina", () => {
  test("portada de la página: se guarda, se reemplaza y la anterior se borra", async () => {
    const { client, token } = await createBusiness();
    const first = uploaded(client.id, "imagenes", "portada");
    const saved = expectOk<{ portadaUrl: string }>(await call(publicPageRoute.PUT, { token, method: "PUT", body: { portada: first } }));
    assert.equal(saved.portadaUrl, first.url);

    await call(publicPageRoute.PUT, { token, method: "PUT", body: { portada: uploaded(client.id, "imagenes", "portada") } });
    assert.deepEqual(offlineDeletions, [first.publicId]);

    const removed = expectOk<{ portadaUrl: string | null }>(await call(publicPageRoute.PUT, { token, method: "PUT", body: { portada: null } }));
    assert.equal(removed.portadaUrl, null);
  });

  test("una portada de otro negocio se rechaza", async () => {
    const { token } = await createBusiness();
    const other = await createBusiness();
    expectError(
      await call(publicPageRoute.PUT, { token, method: "PUT", body: { portada: uploaded(other.client.id, "imagenes", "portada") } }),
      422
    );
  });

  test("imagen de la disciplina: aparece en el catálogo público", async () => {
    const { client, token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    const image = uploaded(client.id, "imagenes", "disciplinas");
    expectOk(await call(disciplineRoute.PUT, { token, method: "PUT", params: { id: disciplines.jump }, body: { imagen: image } }));
    const stored = await prisma.discipline.findUniqueOrThrow({ where: { id: disciplines.jump } });
    assert.equal(stored.imagenPublicId, image.publicId);
    const catalog = await getPublicCatalog(client.id);
    assert.equal(catalog.find((item) => item.id === disciplines.jump)?.imagenUrl, image.url);
  });
});

describe("spec 010 (revisión) · descartar lo subido si el guardado falla", () => {
  test("borra un archivo propio que ningún registro usa", async () => {
    const { client, token } = await createBusiness();
    const orphan = uploaded(client.id, "imagenes");
    assert.equal((await call(mediaRoute.DELETE, { token, method: "DELETE", body: { publicId: orphan.publicId, kind: "IMAGEN" } })).status, 204);
    assert.deepEqual(offlineDeletions, [orphan.publicId]);
  });

  test("no borra un archivo en uso (publicación, portada o disciplina)", async () => {
    const { client, token } = await createBusiness();
    const { disciplines } = await createCatalog(token);
    const inPost = uploaded(client.id, "imagenes");
    await call(postsRoute.POST, { token, method: "POST", body: { tipo: "PUBLICACION", titulo: "Foto", media: inPost } });
    const cover = uploaded(client.id, "imagenes", "portada");
    await call(publicPageRoute.PUT, { token, method: "PUT", body: { portada: cover } });
    const image = uploaded(client.id, "imagenes", "disciplinas");
    await call(disciplineRoute.PUT, { token, method: "PUT", params: { id: disciplines.jump }, body: { imagen: image } });

    for (const media of [inPost, cover, image]) {
      expectError(await call(mediaRoute.DELETE, { token, method: "DELETE", body: { publicId: media.publicId, kind: "IMAGEN" } }), 409);
    }
    assert.deepEqual(offlineDeletions, []);
  });

  test("no borra archivos de otro negocio", async () => {
    const { token } = await createBusiness();
    const other = await createBusiness();
    const foreign = uploaded(other.client.id, "imagenes");
    expectError(await call(mediaRoute.DELETE, { token, method: "DELETE", body: { publicId: foreign.publicId, kind: "IMAGEN" } }), 422);
    assert.deepEqual(offlineDeletions, []);
  });
});
