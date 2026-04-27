import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pagos SaaS API",
  description: "Backend API for Pagos SaaS"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
