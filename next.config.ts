import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Las pruebas de punta a punta (npm run test:e2e) compilan en su propia
  // carpeta para no chocar con un `next dev` que ya este corriendo.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {})
};

export default nextConfig;
