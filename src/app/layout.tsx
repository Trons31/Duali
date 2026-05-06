import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sileo";
import Providers from "@/app/providers";
import "@/app/globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap"
});

const appUrl =
  process.env.NEXT_PUBLIC_BASE_URL ??
  process.env.NEXTAUTH_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: "Duali",
  title: {
    default: "Duali | Gestion academica y cobros",
    template: "%s | Duali"
  },
  description: "Controla estudiantes, grupos, cobros, gastos y recordatorios desde la web de Duali.",
  keywords: [
    "duali",
    "gestion academica",
    "cobros",
    "mensualidades",
    "inscripciones",
    "recordatorios",
    "academia"
  ],
  alternates: {
    canonical: "/"
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Duali",
    statusBarStyle: "default"
  },
  icons: {
    icon: "/logo/icon-metadata.png",
    shortcut: "/logo/icon-metadata.png",
    apple: "/logo/icon-metadata.png"
  },
  openGraph: {
    type: "website",
    url: appUrl,
    siteName: "Duali",
    title: "Duali | Gestion academica y cobros",
    description: "Sistema de gestion academica y cobros para negocios educativos.",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Duali | Gestion academica y cobros"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Duali | Gestion academica y cobros",
    description: "Sistema de gestion academica y cobros para negocios educativos.",
    images: ["/twitter-image.png"]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#14b87e"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
