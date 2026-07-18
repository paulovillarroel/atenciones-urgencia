import type { NextConfig } from "next";

// En GitHub Pages el sitio se sirve bajo /<repo>. La GitHub Action define
// NEXT_PUBLIC_BASE_PATH=/<repo> al construir; en local queda vacío.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export", // exporta HTML/CSS/JS estático a ./out
  trailingSlash: true, // evita 404 al refrescar en GitHub Pages
  images: { unoptimized: true }, // sin servidor de optimización de imágenes
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
