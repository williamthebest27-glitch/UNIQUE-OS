import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs va lasciata fuori dal bundle: e una libreria Node con risorse
  // proprie, e impacchettarla la rompe. Stessa cosa per tesseract.js, che
  // avvia processi figli e carica un modello in WebAssembly: dentro un
  // bundle non trova piu ne i worker ne i dati di lingua.
  serverExternalPackages: ["pdfjs-dist", "tesseract.js"],

  /*
   * Il motore WebAssembly del riconoscimento ottico va caricato a mano
   * sulle funzioni che lo usano.
   *
   * `tesseract.js` risolve `tesseract.js-core` a runtime, dentro il
   * processo worker che avvia: nessuno strumento di analisi statica puo
   * seguirlo, quindi la tracciatura dei file non lo include e su un
   * runtime serverless quei 44 MB non salgono. In locale non si vede —
   * `node_modules` c'e comunque — e in produzione l'import fallisce e il
   * motore si dichiara «non installato» su una macchina dove e
   * installato benissimo.
   *
   * Le rotte elencate sono quelle il cui bundle referenzia davvero
   * tesseract: caricare tutto ovunque significherebbe 44 MB in piu su
   * ogni funzione, e avviamenti a freddo piu lenti su pagine che l'OCR
   * non lo toccano nemmeno.
   *
   * Si includono **tutte** le varianti del core e non solo quella attesa:
   * quale venga scelta dipende dal rilevamento di SIMD sulla macchina che
   * esegue, e indovinare male qui vuol dire OCR rotto in produzione e
   * funzionante ovunque si provi.
   */
  outputFileTracingIncludes: {
    "/api/documenti": ["./node_modules/tesseract.js-core/**/*"],
    "/documenti": ["./node_modules/tesseract.js-core/**/*"],
    "/pro/revisioni": ["./node_modules/tesseract.js-core/**/*"],
    "/pro/pazienti/[id]/documenti": ["./node_modules/tesseract.js-core/**/*"],
    "/pro/pazienti/[id]/documenti/[docId]": ["./node_modules/tesseract.js-core/**/*"],
    "/pro/pazienti/[id]/visita": ["./node_modules/tesseract.js-core/**/*"],
  },
  reactStrictMode: true,
  // Il badge di sviluppo copre l angolo in basso a sinistra, dove vive
  // il profilo nella barra laterale.
  devIndicators: false,
  experimental: {
    serverActions: {
      // I referti in PDF superano di slancio il limite predefinito di 1 MB.
      bodySizeLimit: "12mb",
    },

    // Al passaggio del mouse su una voce del menu, Next va a prendere
    // anche i dati della sezione, non solo il suo scheletro. Fra il
    // momento in cui il puntatore arriva sulla voce e quello in cui il
    // dito preme passano due o trecento millisecondi: quanto basta
    // perché la pagina sia già lì. È la differenza fra uno scheletro che
    // si riempie e una sezione che c’è già.
    //
    // Le voci lo chiedono una per una, con `unstable_dynamicOnHover` in
    // `components/shell/nav-link.tsx`: questo interruttore le abilita.
    dynamicOnHover: true,

    // Quanto a lungo il router del browser può riusare una sezione già
    // vista. Il valore predefinito è zero: tornare su Economia dopo dieci
    // secondi rifaceva tutto il giro fino al database. Trenta secondi
    // sono pochi abbastanza da non mostrare numeri vecchi, e ogni azione
    // che modifica i dati invalida comunque la cache da sé.
    staleTimes: {
      dynamic: 30,
      static: 180,
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
