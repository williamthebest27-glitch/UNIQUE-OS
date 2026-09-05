import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { preload } from "react-dom";
import { appUrl } from "@/lib/supabase/config";
import { MotionProvider } from "@/components/motion/motion-provider";
import { Avvio } from "@/components/brand/avvio";
import "./globals.css";

/**
 * Il carattere.
 *
 * Uno solo per tutto — titoli, sottotitoli, corpo — come fa Apple. Su
 * hardware Apple `-apple-system` consegna San Francisco, che nessuno
 * può servire dal web perché la licenza non lo permette; a tutti gli
 * altri arriva Inter, il parente più stretto che esista: stesse
 * proporzioni da grottesca neutra e — soprattutto — lo stesso asse
 * ottico. È l'asse su cui Apple separa SF Pro Display da SF Pro Text,
 * qui automatico via `font-optical-sizing`: un carattere solo che si
 * ridisegna fra un titolo enorme e una riga di testo.
 *
 * La tipografia porta più valore percepito di qualunque shader: è la
 * prima cosa da azzeccare, non l'ultima.
 */
const inter = Inter({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  // L'origine su cui si risolvono i percorsi relativi dei metadati —
  // l'immagine di anteprima e il canonico della presentazione. Senza,
  // Next ricade su localhost e lo dice a ogni build.
  metadataBase: new URL(appUrl()),
  title: {
    default: "Unique OS",
    template: "%s · Unique OS",
  },
  description: "Il cervello digitale di Unique Longevity Clinic.",
  // La piattaforma tratta dati sanitari: nessuna pagina va indicizzata.
  // La sola eccezione è la presentazione su `/`, che se lo riprende da
  // sé — ed è l'unica pagina che non sta dietro l'accesso.
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
    <html lang="it" className={inter.variable}>
      <body className="min-h-dvh">
        <Avvio />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
