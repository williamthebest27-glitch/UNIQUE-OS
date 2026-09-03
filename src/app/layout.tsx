import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Unique OS",
    template: "%s · Unique OS",
  },
  description: "Il cervello digitale di Unique Longevity Clinic.",
  // La piattaforma tratta dati sanitari: nessuna pagina va indicizzata.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#faf8f5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
