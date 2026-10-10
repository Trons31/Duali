import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { before, describe, test } from "node:test";
import { v2 as cloudinary } from "cloudinary";
import { IMAGE_TRANSFORMATION, SERVER_IMAGE_TRANSFORMATION, assertOwnedMedia, signUpload } from "@/lib/cloudinary";
import { belongsToBusiness, extractCloudinaryPublicId, mediaFolder } from "@/lib/media-folders";
import { parseVideoLink } from "@/lib/video-links";

describe("carpetas en Cloudinary (spec 010)", () => {
  test("orden duali/negocios/{id}/imagenes|videos/{uso}", () => {
    assert.equal(mediaFolder("cl123", "IMAGEN", "publicaciones"), "duali/negocios/cl123/imagenes/publicaciones");
    assert.equal(mediaFolder("cl123", "VIDEO", "publicaciones"), "duali/negocios/cl123/videos/publicaciones");
    assert.equal(mediaFolder("cl123", "IMAGEN", "portada"), "duali/negocios/cl123/imagenes/portada");
  });

  test("un id raro no puede escaparse de su carpeta", () => {
    assert.throws(() => mediaFolder("../otro", "IMAGEN", "portada"));
    assert.throws(() => mediaFolder("a/b", "IMAGEN", "portada"));
  });

  test("pertenencia por prefijo exacto del negocio y del tipo", () => {
    assert.equal(belongsToBusiness("duali/negocios/cl1/imagenes/publicaciones/foto", "cl1", "IMAGEN"), true);
    assert.equal(belongsToBusiness("duali/negocios/cl1/videos/publicaciones/clip", "cl1", "IMAGEN"), false);
    assert.equal(belongsToBusiness("duali/negocios/cl10/imagenes/publicaciones/foto", "cl1", "IMAGEN"), false);
    assert.equal(belongsToBusiness("duali/negocios/cl1/imagenes/../../cl2/x", "cl1", "IMAGEN"), false);
    assert.equal(belongsToBusiness("nubi/barbershop/cl1/logo/x", "cl1"), false);
  });

  test("public_id desde una URL de Cloudinary", () => {
    assert.equal(
      extractCloudinaryPublicId("https://res.cloudinary.com/demo/image/upload/v1712/duali/negocios/cl1/imagenes/portada/abc.jpg"),
      "duali/negocios/cl1/imagenes/portada/abc"
    );
    assert.equal(
      extractCloudinaryPublicId("https://res.cloudinary.com/demo/image/upload/c_fill,w_400/v1712/duali/negocios/cl1/imagenes/portada/abc.webp"),
      "duali/negocios/cl1/imagenes/portada/abc"
    );
    assert.equal(extractCloudinaryPublicId("https://example.com/foto.jpg"), null);
  });
});

describe("firma de subidas (spec 010 R1)", () => {
  before(() => {
    process.env.CLOUDINARY_CLOUD_NAME = "demo-duali";
    process.env.CLOUDINARY_API_KEY = "123456";
    process.env.CLOUDINARY_API_SECRET = "secreto-de-prueba";
    process.env.DUALI_MEDIA_OFFLINE = "1";
  });

  test("firma la carpeta del negocio y los formatos, como documenta Cloudinary", async () => {
    const signed = await signUpload("cl1", "IMAGEN", "publicaciones", 1_700_000_000_000);
    assert.equal(signed.folder, "duali/negocios/cl1/imagenes/publicaciones");
    assert.equal(signed.uploadUrl, "https://api.cloudinary.com/v1_1/demo-duali/image/upload");
    assert.equal(signed.timestamp, 1_700_000_000);
    const expected = createHash("sha1")
      .update(
        "allowed_formats=jpg,jpeg,png,webp,heic&folder=duali/negocios/cl1/imagenes/publicaciones&timestamp=1700000000" +
          "&transformation=c_limit,w_2000,h_2000,q_auto" +
          "secreto-de-prueba"
      )
      .digest("hex");
    assert.equal(signed.signature, expected);
    assert.equal(JSON.stringify(signed).includes("secreto-de-prueba"), false, "nunca devuelve el secreto");
  });

  test("videos: endpoint de video, formatos de video y solo en publicaciones", async () => {
    const signed = await signUpload("cl1", "VIDEO", "publicaciones");
    assert.match(signed.uploadUrl, /\/video\/upload$/);
    assert.equal(signed.allowedFormats, "mp4,mov,webm");
    assert.equal(signed.transformation, null, "los videos no se transforman al subir");
    assert.equal(signed.maxBytes, 100 * 1024 * 1024);
    await assert.rejects(signUpload("cl1", "VIDEO", "portada"), /publicaciones/);
  });

  test("solo acepta archivos de la nube y carpeta del negocio", () => {
    const ok = {
      url: "https://res.cloudinary.com/demo-duali/image/upload/v1/duali/negocios/cl1/imagenes/publicaciones/foto.jpg",
      publicId: "duali/negocios/cl1/imagenes/publicaciones/foto"
    };
    assert.doesNotThrow(() => assertOwnedMedia(ok, "cl1", "IMAGEN"));
    assert.throws(() => assertOwnedMedia(ok, "cl2", "IMAGEN"), /no pertenece/);
    assert.throws(() => assertOwnedMedia(ok, "cl1", "VIDEO"), /no pertenece/);
    assert.throws(() => assertOwnedMedia({ ...ok, url: ok.url.replace("demo-duali", "otra-nube") }, "cl1", "IMAGEN"), /no pertenece/);
    assert.throws(() => assertOwnedMedia({ ...ok, url: ok.url.replace("https:", "http:") }, "cl1", "IMAGEN"), /no pertenece/);
    assert.throws(() => assertOwnedMedia({ url: ok.url, publicId: "duali/negocios/cl1/imagenes/publicaciones/otra" }, "cl1", "IMAGEN"));
  });
});

describe("enlaces de video (spec 010 R2)", () => {
  test("YouTube en todas sus formas, embebido sin cookies", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://youtube.com/shorts/dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10"
    ]) {
      const link = parseVideoLink(url);
      assert.equal(link?.provider, "youtube", url);
      assert.equal(link?.embedUrl, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    }
  });

  test("Instagram (post y reel) y TikTok", () => {
    assert.equal(parseVideoLink("https://www.instagram.com/reel/C8abcDEF12/?igsh=x")?.embedUrl, "https://www.instagram.com/reel/C8abcDEF12/embed");
    assert.equal(parseVideoLink("https://instagram.com/p/C8abcDEF12/")?.provider, "instagram");
    assert.equal(
      parseVideoLink("https://www.tiktok.com/@studiodance/video/7351234567890123456?lang=es")?.embedUrl,
      "https://www.tiktok.com/embed/v2/7351234567890123456"
    );
  });

  test("rechaza otros sitios, esquemas peligrosos y enlaces incompletos", () => {
    for (const url of [
      "https://vimeo.com/123456",
      "https://evil.com/watch?v=dQw4w9WgXcQ",
      "javascript:alert(1)",
      "https://www.youtube.com/",
      "https://www.instagram.com/studiodance/",
      "https://www.tiktok.com/@studiodance",
      "no es un enlace"
    ]) {
      assert.equal(parseVideoLink(url), null, url);
    }
  });
});

describe("subida del comprobante desde el servidor (spec 021 R4)", () => {
  test("la reducción va como objeto: un texto el SDK lo manda como transformación guardada (t_…)", () => {
    const sent = cloudinary.utils.generate_transformation_string({ transformation: SERVER_IMAGE_TRANSFORMATION });
    assert.equal(sent.startsWith("t_"), false);
    assert.deepEqual(sent.split(",").sort(), IMAGE_TRANSFORMATION.split(",").sort(), "la misma reducción que la subida del navegador");
  });
});
