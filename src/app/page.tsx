import type { Metadata, Viewport } from "next";
import { getCurrentProfile, homePathForRole } from "@/lib/auth";
import { appUrl } from "@/lib/supabase/config";
import { UniqueLanding } from "@/components/landing/landing";

/**
 * La radice: la presentazione di Unique OS.
 *
 * **Prima qui c'era uno smistamento.** `/` leggeva il profilo e
 * rimandava al livello del ruolo — ed è una cosa che serve ancora, ma
 * non può stare sull'unico indirizzo che una persona digita, condivide o
 * riceve da un link: quello deve poter essere aperto da chi non ha un
 * account. Lo smistamento si è spostato in `/app`, che è il suo posto
 * proprio, e le tre cose che ci arrivavano — il modulo d'accesso, la
 * scelta della password, il proxy — puntano lì.
 *
 * **Chi ha già una sessione non viene rimandato via.** Vede la stessa
 * pagina, con il comando principale che porta al suo livello invece che
 * all'accesso: una persona che apre l'indirizzo della clinica ha il
 * diritto di guardarne la presentazione anche quando è già dentro, e un
 * rimbalzo automatico gliela renderebbe irraggiungibile.
 *
 * Il costo per un visitatore anonimo è zero: senza cookie di sessione,
 * `getCurrentProfile()` risponde null dopo una verifica locale del
 * token, senza toccare il database.
 */
export const dynamic = "force-dynamic";

const TITOLO = "Unique OS — The intelligence behind your longevity";
const DESCRIZIONE =
  "Il sistema operativo digitale di Unique Longevity Clinic: biomarcatori, diagnostica, " +
  "stile di vita e dati clinici in un unico sistema vivo che li trasforma in una direzione. " +
  "Longevity Score, percorsi di 90 giorni e intelligenza personale al servizio della " +
  "medicina preventiva.";

export function generateMetadata(): Metadata {
  const origine = appUrl();

  return {
    metadataBase: new URL(origine),
    title: TITOLO,
    description: DESCRIZIONE,
    applicationName: "Unique OS",
    keywords: [
      "longevity",
      "medicina preventiva",
      "longevity clinic",
      "salute personalizzata",
      "biomarcatori",
      "longevity score",
      "medicina di precisione",
      "health intelligence",
      "Unique Longevity Clinic",
    ],
    alternates: { canonical: "/" },
    // La sola pagina indicizzabile dell'intero prodotto: tutto ciò che
    // sta dietro l'accesso tratta dati sanitari e resta fuori dai motori
    // di ricerca, per la regola scritta nel layout radice.
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
    },
    openGraph: {
      type: "website",
      siteName: "Unique OS",
      locale: "it_IT",
      url: origine,
      title: TITOLO,
      description: DESCRIZIONE,
    },
    twitter: {
      card: "summary_large_image",
      title: TITOLO,
      description: DESCRIZIONE,
    },
  };
}

/**
 * Il colore della barra del browser.
 *
 * Il guscio dell'applicazione lo dichiara bianco, perché l'applicazione è
 * bianca. La presentazione è nera, e su telefono la barra degli indirizzi
 * prende quel colore: senza questa riga, sopra una pagina nera resterebbe
 * una striscia bianca che sembra un errore di caricamento.
 */
export const viewport: Viewport = {
  themeColor: "#08090a",
  width: "device-width",
  initialScale: 1,
};

export default async function RootPage() {
  const profile = await getCurrentProfile();

  /* Le destinazioni si decidono qui, una volta sola, dal routing vero.
     `/app` è lo smistamento per ruolo; `/accedi` è la porta; il modo
     "attiva" apre il modulo dal lato di chi la password non ce l'ha
     ancora — che alla Unique è la strada normale, non un ripiego, perché
     gli account li crea la clinica. */
  const entra = profile ? homePathForRole(profile.role) : "/accedi";
  const etichettaEntra = profile ? "Torna in Unique OS" : "Entra in Unique OS";

  return (
    <UniqueLanding
      entra={entra}
      registrati="/accedi?modo=attiva"
      etichettaEntra={etichettaEntra}
      autenticato={Boolean(profile)}
      anno={new Date().getFullYear()}
    />
  );
}
