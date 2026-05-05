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
    icons: [
      {
        src: "/logo/icon-metadata.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
