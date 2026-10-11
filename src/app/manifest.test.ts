import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import manifest from "./manifest";

test("manifest: íconos con el logo nuevo, 192/512 y maskable, y los archivos existen", () => {
  const icons = manifest().icons ?? [];
  const png = icons.filter((icon) => icon.type === "image/png");
  assert.ok(png.some((icon) => icon.sizes === "192x192"));
  assert.ok(png.some((icon) => icon.sizes === "512x512" && icon.purpose === "any"));
  assert.ok(png.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
  for (const icon of icons) {
    // Las rutas viejas quedaron en caché en celulares con la app instalada.
    assert.equal(icon.src.includes("icon-metadata"), false);
    assert.ok(existsSync(path.join(process.cwd(), "public", icon.src)), `falta ${icon.src}`);
  }
});
