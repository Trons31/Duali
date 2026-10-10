// Spec 010 (revision): como en Nubi, nada se sube a Cloudinary hasta guardar.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { discardUploaded, draftFromSaved, resolveMediaDraft } from "@/components/dashboard/media-uploader";

type Call = { url: string; method: string; body?: string };
let calls: Call[] = [];
let xhrUploads: Array<{ url: string; fields: Record<string, unknown> }> = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  xhrUploads = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
    if (url.endsWith("/api/media/signature")) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            uploadUrl: "https://api.cloudinary.com/v1_1/demo/image/upload",
            apiKey: "1",
            timestamp: 1,
            signature: "firma",
            folder: "duali/negocios/cl1/imagenes/publicaciones",
            allowedFormats: "jpg",
            transformation: "c_limit,w_2000,h_2000,q_auto",
            maxBytes: 10
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  // XMLHttpRequest minimo: registra la subida directa y responde como Cloudinary.
  (globalThis as Record<string, unknown>).XMLHttpRequest = class {
    status = 0;
    responseText = "";
    upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
    onload?: () => void;
    onerror?: () => void;
    private url = "";
    open(_method: string, url: string) {
      this.url = url;
    }
    send(form: FormData) {
      xhrUploads.push({ url: this.url, fields: Object.fromEntries([...form.entries()].filter(([key]) => key !== "file")) });
      this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 1 });
      this.status = 200;
      this.responseText = JSON.stringify({
        secure_url: "https://res.cloudinary.com/demo/image/upload/v1/duali/negocios/cl1/imagenes/publicaciones/nuevo.jpg",
        public_id: "duali/negocios/cl1/imagenes/publicaciones/nuevo"
      });
      this.onload?.();
    }
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("subida al guardar (spec 010, como Nubi)", () => {
  test("lo ya guardado no toca la red", async () => {
    const draft = draftFromSaved("https://res.cloudinary.com/demo/image/upload/v1/x.jpg", "duali/negocios/cl1/imagenes/publicaciones/x");
    const result = await resolveMediaDraft(draft, { token: "t", kind: "IMAGEN", use: "publicaciones" });
    assert.equal(result.media?.publicId, "duali/negocios/cl1/imagenes/publicaciones/x");
    assert.equal(result.uploaded, null);
    assert.equal(calls.length + xhrUploads.length, 0);
  });

  test("sin archivo no hay subida", async () => {
    const result = await resolveMediaDraft(null, { token: "t", kind: "IMAGEN", use: "publicaciones" });
    assert.deepEqual(result, { media: null, uploaded: null });
    assert.equal(calls.length + xhrUploads.length, 0);
  });

  test("un archivo pendiente se firma y se sube directo a Cloudinary, con la transformación firmada", async () => {
    const progress: number[] = [];
    const file = new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" });
    const result = await resolveMediaDraft(
      { file, previewUrl: "blob:local" },
      { token: "t", kind: "IMAGEN", use: "publicaciones", onProgress: (value) => progress.push(value) }
    );
    assert.deepEqual(calls.map((call) => call.url), ["/api/media/signature"]);
    assert.equal(xhrUploads.length, 1);
    assert.equal(xhrUploads[0].url, "https://api.cloudinary.com/v1_1/demo/image/upload");
    assert.equal(xhrUploads[0].fields.transformation, "c_limit,w_2000,h_2000,q_auto");
    assert.equal(xhrUploads[0].fields.folder, "duali/negocios/cl1/imagenes/publicaciones");
    assert.equal(result.uploaded?.publicId, "duali/negocios/cl1/imagenes/publicaciones/nuevo");
    assert.deepEqual(progress, [1 * 100]);
  });

  test("si el guardado falla, lo recién subido se descarta", async () => {
    await discardUploaded("t", { url: "u", publicId: "duali/negocios/cl1/imagenes/publicaciones/nuevo" }, "IMAGEN");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/media");
    assert.equal(calls[0].method, "DELETE");
    assert.deepEqual(JSON.parse(calls[0].body!), { publicId: "duali/negocios/cl1/imagenes/publicaciones/nuevo", kind: "IMAGEN" });

    await discardUploaded("t", null, "IMAGEN");
    assert.equal(calls.length, 1, "sin subida no descarta nada");
  });
});
