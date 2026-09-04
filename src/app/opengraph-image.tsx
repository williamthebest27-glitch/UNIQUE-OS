import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * L'immagine di anteprima.
 *
 * È la prima cosa che si vede di Unique OS quando il link passa in una
 * chat, in una mail a un investitore o in un messaggio della segreteria
 * a un paziente — spesso *prima* della pagina. Quindi non è un dettaglio
 * di SEO: è la copertina.
 *
 * Il disegno è quello dell'hero, ridotto all'osso perché a 1200×630
 * dentro un'anteprima non c'è spazio per altro: il vuoto, il marchio, la
 * frase, e la riga di stato con i numeri veri del prodotto.
 *
 * Il carattere è quello predefinito di `next/og`: Fraunces vive come
 * carattere variabile servito dal browser e non arriva fin qui senza una
 * richiesta di rete a tempo di build, che su un runner senza uscita
 * fallirebbe l'intera compilazione. Meglio una copertina che si genera
 * sempre, disegnata per il carattere che ha davvero — maiuscoletto
 * spaziato e peso leggero — che una che a volte non esiste.
 */

export const alt =
  "Unique OS — The intelligence behind your longevity. Il sistema operativo digitale di Unique Longevity Clinic.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Il marchio come data URI: Satori non va a prendere file dal disco. */
async function marchio(): Promise<string | null> {
  try {
    const dati = await readFile(join(process.cwd(), "public", "marchio-unique.png"));
    return `data:image/png;base64,${dati.toString("base64")}`;
  } catch {
    // Senza il marchio la copertina resta valida: meglio una tipografica
    // che un errore di build in un ambiente dove `public/` non è a mano.
    return null;
  }
}

const STATO = [
  ["PILLARS", "07"],
  ["SIGNALS", "35"],
  ["SOURCES", "11"],
  ["CYCLE", "90d"],
] as const;

export default async function OpenGraphImage() {
  const logo = await marchio();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          backgroundColor: "#08090a",
          backgroundImage:
            "radial-gradient(650px 420px at 50% 34%, rgba(255,111,133,0.16), rgba(51,116,130,0.07) 55%, rgba(8,9,10,0) 78%)",
          color: "#ffffff",
        }}
      >
        {/* ── In alto: il marchio ──────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} width={44} height={49} alt="" />
          ) : null}
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 27, fontWeight: 500, letterSpacing: -0.4 }}>
              Unique
            </span>
            <span
              style={{
                fontSize: 17,
                letterSpacing: 4,
                color: "rgba(255,255,255,0.46)",
              }}
            >
              OS
            </span>
          </div>
        </div>

        {/* ── Al centro: la frase ──────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 17,
              letterSpacing: 5,
              color: "#ff6f85",
              marginBottom: 26,
            }}
          >
            THE SYSTEM BEHIND PREVENTIVE MEDICINE
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 78,
              lineHeight: 1.06,
              fontWeight: 300,
              letterSpacing: -2.6,
            }}
          >
            <span>The intelligence</span>
            <span>behind your longevity.</span>
          </div>
        </div>

        {/* ── In basso: la riga di stato ───────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div
            style={{
              display: "flex",
              height: 1,
              width: "100%",
              backgroundImage:
                "linear-gradient(90deg, #337482, #ff6f85 62%, #dcc191)",
            }}
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: 40 }}>
              {STATO.map(([chiave, valore]) => (
                <div key={chiave} style={{ display: "flex", gap: 10, fontSize: 16 }}>
                  <span style={{ letterSpacing: 3, color: "rgba(255,255,255,0.30)" }}>
                    {chiave}
                  </span>
                  <span style={{ letterSpacing: 3, color: "#8ab4b6" }}>{valore}</span>
                </div>
              ))}
            </div>

            <span
              style={{
                fontSize: 16,
                letterSpacing: 3,
                color: "rgba(255,255,255,0.30)",
              }}
            >
              UNIQUE LONGEVITY CLINIC
            </span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
