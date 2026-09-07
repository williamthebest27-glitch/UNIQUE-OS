/**
 * Le intestazioni di sicurezza.
 *
 * Un modulo a parte e non due righe dentro il proxy, per una ragione
 * sola: una Content Security Policy sbagliata non dà errore, dà una
 * pagina che non funziona — e il modo di accorgersene è provarla. Qui è
 * una funzione pura con una stringa in uscita, e ha dei test.
 *
 * Non importa nulla, nemmeno la configurazione: l'origine di Supabase
 * arriva come argomento. Serve a poterla verificare senza un ambiente.
 */

/**
 * L'origine di un URL, o `null` se non è un URL.
 *
 * `https://abc.supabase.co/rest/v1` diventa `https://abc.supabase.co`.
 * Nella policy va l'origine e non l'URL intero: un percorso in una
 * direttiva `connect-src` non viene ignorato, viene *applicato*, e
 * bloccherebbe ogni chiamata che non comincia esattamente per quello.
 */
export function origineDi(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * La policy.
 *
 * Unique non carica **niente** da terzi: nessuno script esterno, nessun
 * font remoto — `next/font` li scarica a build time e li serve dal
 * dominio — nessun pixel di analytics. È la condizione che permette una
 * policy stretta invece di una decorativa, ed è anche la ragione per cui
 * va difesa: il giorno in cui qualcuno aggiunge un tag di tracciamento,
 * questa funzione è il posto in cui deve accorgersene.
 *
 * Le tre scelte che valgono una spiegazione:
 *
 * **`'strict-dynamic'`** — Next carica i propri frammenti di codice da
 * uno script che ha già il nonce. Con `strict-dynamic` la fiducia si
 * propaga a ciò che quello script carica, e l'elenco dei domini smette
 * di servire. Senza, ogni chunk andrebbe elencato a mano.
 *
 * **`'unsafe-eval'` solo in sviluppo** — React usa `eval` per
 * ricostruire nel browser gli stack degli errori del server. In
 * produzione non serve a nessuno dei due, e lì non c'è.
 *
 * **`'unsafe-inline'` sugli stili, senza nonce** — è l'unico
 * allentamento, ed è la riga che questo file ha imparato provandola.
 *
 * Il primo tentativo metteva nonce e `unsafe-inline` insieme, come una
 * cintura con le bretelle. Non lo è: **quando è presente un nonce il
 * browser ignora `unsafe-inline`**, per specifica. Il risultato erano
 * cinquecento violazioni in console e ogni animazione ferma — React
 * scrive `style="…"` a ogni render, GSAP lo fa sessanta volte al
 * secondo, e nessuno dei due può portare un nonce su un attributo.
 *
 * Il secondo tentativo separava le direttive: nonce sugli elementi
 * `<style>`, `style-src-attr 'unsafe-inline'` sugli attributi. È la
 * forma giusta e non regge sul campo — dove `style-src-attr` non è
 * riconosciuto si ricade su `style-src`, e si torna a tutto bloccato.
 *
 * Quindi la scelta è dichiarata invece che nascosta. **Uno stile
 * iniettato non esegue codice**, e la via classica per farne un furto —
 * un selettore che chiama un'immagine su un dominio altrui — è chiusa
 * altrove: `img-src` e `connect-src` ammettono solo questa origine e
 * Supabase. `script-src`, che è la direttiva che conta, non concede
 * niente.
 */
export function politicaContenuti(opzioni: {
  nonce: string;
  /** L'URL del progetto Supabase: da lì passano dati e websocket. */
  supabaseUrl?: string;
  sviluppo?: boolean;
}): string {
  const origine = opzioni.supabaseUrl ? origineDi(opzioni.supabaseUrl) : null;

  // Il realtime è un websocket sullo stesso host: `connect-src` non
  // deduce `wss:` da `https:`, va scritto.
  const websocket = origine ? origine.replace(/^https:/, "wss:") : null;

  /*
   * In sviluppo passa anche il websocket del ricaricamento a caldo.
   *
   * `'self'` **non copre `ws:`**: lo schema di un websocket è diverso da
   * quello della pagina, e va elencato. Senza questa riga `next dev`
   * perde l'aggiornamento automatico e non lo dice — la console si
   * riempie di «WebSocket connection failed» e la pagina smette
   * semplicemente di rinfrescarsi.
   *
   * In produzione non esiste: l'elenco resta chiuso su Supabase.
   */
  const sviluppo = opzioni.sviluppo ? ["ws://localhost:*", "ws://127.0.0.1:*"] : [];

  const connessioni = ["'self'", origine, websocket, ...sviluppo]
    .filter(Boolean)
    .join(" ");

  // Le immagini dei referti arrivano dallo storage con un URL firmato,
  // quindi dall'origine di Supabase; `blob:` serve alle anteprime che il
  // browser costruisce prima del caricamento.
  const immagini = ["'self'", "blob:", "data:", origine].filter(Boolean).join(" ");

  const direttive = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${opzioni.nonce}' 'strict-dynamic'${
      opzioni.sviluppo ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${immagini}`,
    "font-src 'self'",
    "media-src 'self'",
    `connect-src ${connessioni}`,
    // Nessun documento clinico va aperto dentro un iframe di qualcun
    // altro, e Unique non ne incorpora nessuno.
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    // Un modulo che invia altrove è il modo in cui una pagina iniettata
    // ruba una password.
    "form-action 'self'",
    "upgrade-insecure-requests",
  ];

  return direttive.join("; ");
}

/**
 * Le intestazioni fisse, quelle che non dipendono dalla richiesta.
 *
 * `Strict-Transport-Security` vale due anni con i sottodomini: è la
 * durata che i browser chiedono per l'inserimento nella lista di
 * precarico. Non c'è `preload` nella direttiva perché iscriversi a
 * quella lista è una decisione difficile da revocare, e non la prende
 * una migrazione.
 *
 * Non c'è `X-XSS-Protection`: era un filtro euristico dei browser
 * vecchi, i moderni l'hanno rimosso, e in alcune versioni introduceva
 * essa stessa una vulnerabilità. La CSP fa il suo lavoro.
 */
export const INTESTAZIONI_FISSE: ReadonlyArray<readonly [string, string]> = [
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  [
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  ],
  // Isola la finestra da chi la apre: senza, una pagina esterna che
  // aprisse Unique manterrebbe un riferimento a `window.opener`.
  ["Cross-Origin-Opener-Policy", "same-origin"],
];
