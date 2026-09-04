import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs va lasciata fuori dal bundle: e una libreria Node con risorse
  // proprie, e impacchettarla la rompe.
  serverExternalPackages: ["pdfjs-dist"],
  reactStrictMode: true,
  // Il badge di sviluppo copre l angolo in basso a sinistra, dove vive
  // il profilo nella barra laterale.
  devIndicators: false,
  experimental: {
    serverActions: {
      // I referti in PDF superano di slancio il limite predefinito di 1 MB.
      bodySizeLimit: "12mb",
    },
  },
  // Unique OS tratta dati sanitari: nessuna informazione di build
  // deve finire negli header di risposta.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
