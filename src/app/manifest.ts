import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Duali",
    short_name: "Duali",
    description: "Gestiona estudiantes, cobros y recordatorios desde cualquier dispositivo.",
    start_url: "/",
    display: "standalone",
    background_color: "#fcfaf6",
    theme_color: "#14b87e",
    lang: "es",
    // Nombres nuevos a propósito: Android (WebAPK) y el navegador guardan el ícono
    // por URL, así que reusar la ruta vieja dejaba el logo anterior al instalar.
    icons: [
      { src: "/logo/duali-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/logo/duali-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/logo/duali-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/logo/duali-icon.svg", sizes: "any", type: "image/svg+xml" }
    ]
  };
}
