import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { preload } from "react-dom";
import { MotionProvider } from "@/components/motion/motion-provider";
import { Avvio } from "@/components/brand/avvio";
import "./globals.css";

/**
 * I caratteri.
 *
 * Fraunces per il display: variabile, con l'asse ottico che cambia il
 * disegno fra un titolo enorme e una riga di testo, e un'italica che vale
 * da sola il prezzo. Inter per l'interfaccia, dove serve sparire.
 *
 * La tipografia porta più valore percepito di qualunque shader: è la
 * prima cosa da azzeccare, non l'ultima.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

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
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Il marchio del sipario è la prima cosa che si vede: va chiesto
  // insieme all'HTML, non quando il browser incontra l'<image> nell'SVG.
  preload("/marchio-unique.png", { as: "image", fetchPriority: "high" });

  return (
    <html lang="it" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-dvh">
        <Avvio />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
