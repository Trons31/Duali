import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = {
  width: 1200,
  height: 630
};

async function loadLogoDataUri() {
  const filePath = path.join(process.cwd(), "public", "logo", "icon-metadata.png");
  const file = await readFile(filePath);
  return `data:image/png;base64,${file.toString("base64")}`;
}

export default async function OpenGraphImage() {
  const logoSrc = await loadLogoDataUri();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#ffffff",
          color: "#0f172a",
          fontFamily: "Inter, sans-serif"
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            padding: "48px",
            background:
              "radial-gradient(circle at top left, rgba(20,184,126,0.18), transparent 32%), radial-gradient(circle at bottom right, rgba(99,102,241,0.12), transparent 28%), #ffffff"
          }}
        >
          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              borderRadius: "36px",
              border: "1px solid rgba(15,23,42,0.08)",
              background: "rgba(255,255,255,0.94)",
              padding: "48px",
              boxShadow: "0 24px 80px rgba(15,23,42,0.08)"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              <img src={logoSrc} width="92" height="92" alt="Duali" />
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: "0.28em",
                    textTransform: "uppercase",
                    color: "#047857"
                  }}
                >
                  Duali
                </div>
                <div style={{ fontSize: 22, color: "#64748b" }}>Gestion academica y cobros</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "820px" }}>
              <div
                style={{
                  fontSize: 72,
                  lineHeight: 1.02,
                  fontWeight: 900,
                  letterSpacing: "-0.04em"
                }}
              >
                Controla estudiantes, grupos y cobros desde una sola plataforma.
              </div>
              <div style={{ fontSize: 32, lineHeight: 1.35, color: "#475569" }}>
                Recordatorios, pagos, contabilidad y operacion diaria con una experiencia clara para academias y
                negocios educativos.
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "20px"
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "14px"
                }}
              >
                {["Cobros", "Inscripciones", "Contabilidad", "Notificaciones"].map((item) => (
                  <div
                    key={item}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      borderRadius: "999px",
                      border: "1px solid rgba(15,23,42,0.08)",
                      padding: "12px 18px",
                      fontSize: 22,
                      color: "#0f172a"
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#0f766e" }}>duali.app</div>
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
