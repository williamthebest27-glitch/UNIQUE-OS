import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isSupabaseConfigured,
  modalitaDimostrativaAmmessa,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/supabase/config";
import { INTESTAZIONI_FISSE, politicaContenuti } from "@/lib/sicurezza/intestazioni";

/**
 * In Next 16 il file `middleware.ts` è stato rinominato `proxy.ts`.
 *
 * Qui facciamo due cose, e solo queste: rinnoviamo il token di sessione
 * a ogni richiesta e teniamo fuori chi non ha effettuato l’accesso.
 * Il controllo su *quali dati* un utente può vedere non sta qui — sta
 * nella Row Level Security, dove non può essere aggirato.
 */

/**
 * Percorsi raggiungibili senza sessione.
 *
 * La radice è la presentazione di Unique OS: è l'unico indirizzo che una
 * persona digita, condivide o riceve in un link, e deve aprirsi anche
 * per chi un account non ce l'ha. Sta fra gli esatti e non fra i
 * prefissi per una ragione aritmetica, non stilistica: `"/"` come
 * prefisso renderebbe pubblica ogni pagina dell'applicazione, perché
 * ogni percorso comincia per barra.
 *
 * **La copertina va con lei.** `/opengraph-image` è l'anteprima che
 * WhatsApp, LinkedIn e Slack vanno a prendere quando qualcuno incolla il
 * link della presentazione. Senza sessione — e un crawler non ne ha
 * nessuna — finiva nella guardia e riceveva un 307 verso l'accesso: la
 * copertina esisteva, era disegnata con cura, e non l'ha mai vista
 * nessuno. È lo stesso guasto muto descritto nel matcher qui sotto, con
 * l'aggravante che lì basta l'estensione a salvare un file, mentre una
 * rotta senza estensione passa dritta di qua.
 *
 * Renderla pubblica non apre niente: la copertina è composta di testo
 * fisso e del marchio letto da `public/`, non tocca il database e non
 * accetta parametri. Se un giorno mostrasse un dato di una persona,
 * questa riga va tolta lo stesso giorno.
 */
const PUBLIC_EXACT = ["/", "/opengraph-image"];

// /api/integrazioni parla con il gestionale, non con una persona: si
// autentica con un token proprio, non con un cookie di sessione.
const PUBLIC_PREFIXES = ["/accedi", "/auth", "/api/integrazioni"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  /*
   * Il nonce nasce qui, uno per richiesta.
   *
   * Deve essere imprevedibile: se si ripetesse, chi riuscisse a
   * iniettare uno script in una pagina potrebbe riusarlo nella
   * successiva, e la Content Security Policy tornerebbe a essere una
   * decorazione. `crypto.randomUUID()` viene dal generatore del sistema.
   */
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = politicaContenuti({
    nonce,
    supabaseUrl,
    sviluppo: process.env.NODE_ENV === "development",
  });

  /*
   * Le intestazioni vanno su **ogni** risposta, rinvii compresi.
   *
   * Un 307 verso `/accedi` è comunque una risposta che il browser
   * riceve, e lasciarla scoperta significa che la sola pagina che tutti
   * vedono — quella d'accesso, che ha un campo password — arriverebbe
   * senza policy nel caso in cui il rinvio fosse l'ultima tappa.
   */
  const vestita = <T extends NextResponse>(risposta: T): T => {
    risposta.headers.set("Content-Security-Policy", csp);
    for (const [nome, valore] of INTESTAZIONI_FISSE) {
      risposta.headers.set(nome, valore);
    }
    return risposta;
  };

  // Next legge il nonce dall'intestazione della *richiesta* e lo applica
  // ai propri script in linea: senza questo passaggio l'idratazione
  // verrebbe bloccata dalla policy che abbiamo appena scritto.
  const intestazioniRichiesta = new Headers(request.headers);
  intestazioniRichiesta.set("x-nonce", nonce);
  intestazioniRichiesta.set("Content-Security-Policy", csp);

  /*
   * Senza configurazione ci sono due situazioni, e vanno distinte.
   *
   * In **sviluppo** è la modalità dimostrativa: nessun database, nessuna
   * sessione da proteggere, si lavora sull'interfaccia. Le intestazioni
   * servono lo stesso.
   *
   * In **produzione** è un guasto, e prima di questo blocco era un
   * guasto che apriva la porta: il proxy lasciava passare chiunque su
   * ogni percorso, e `getCurrentProfile()` rispondeva con il paziente di
   * esempio. Una variabile d'ambiente non propagata a un deploy —
   * l'errore di configurazione più comune che esista — trasformava
   * l'area riservata in un sito pubblico, senza nessun segnale che
   * qualcosa non andasse.
   *
   * Un 503 e non un rinvio all'accesso: la pagina d'accesso senza
   * Supabase non può autenticare nessuno, e mandarcisi sarebbe un giro
   * a vuoto che nasconde la causa.
   */
  if (!isSupabaseConfigured()) {
    if (modalitaDimostrativaAmmessa()) {
      return vestita(NextResponse.next({ request: { headers: intestazioniRichiesta } }));
    }

    console.error(
      "[proxy] NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY mancanti in produzione.",
    );

    return vestita(
      new NextResponse(
        "Unique OS non è configurato correttamente su questo ambiente. " +
          "Nessun dato è accessibile finché la configurazione non è ripristinata.",
        {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "Retry-After": "120",
          },
        },
      ),
    );
  }

  let response = NextResponse.next({ request: { headers: intestazioniRichiesta } });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        /*
         * Le intestazioni si ricostruiscono qui e non si riusano quelle
         * di prima: `request.cookies.set` ha appena riscritto
         * l'intestazione `cookie` della richiesta, e una copia fatta
         * poco fa porterebbe avanti il token vecchio. Il nonce invece è
         * lo stesso — è della richiesta, non del cookie.
         */
        const aggiornate = new Headers(request.headers);
        aggiornate.set("x-nonce", nonce);
        aggiornate.set("Content-Security-Policy", csp);

        response = NextResponse.next({ request: { headers: aggiornate } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Questo codice gira prima di ogni pagina, di ogni navigazione e di
  // ogni prefetch: ciò che si spende qui è ritardo su tutto il resto.
  //
  // getClaims() verifica la firma del token con la chiave pubblica del
  // progetto, senza chiedere nulla a nessuno. Il cookie non viene creduto
  // sulla parola — sarebbe quello che fa getSession(), ed è il motivo per
  // cui non si usa — ma nemmeno pagato con un viaggio di rete a ogni
  // clic. Il rinnovo del token continua ad avvenire: getClaims legge la
  // sessione, e la libreria la rinfresca da sé quando è scaduta.
  //
  // Se il progetto usa ancora le chiavi simmetriche, la libreria ricade
  // internamente su getUser(): stessa sicurezza, stesso costo di prima.
  const { data } = await supabase.auth.getClaims();
  const autenticato = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;

  if (!autenticato && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/accedi";
    url.search = "";
    // Ricordiamo dove voleva andare, per riportarlo lì dopo l’accesso.
    if (pathname !== "/") url.searchParams.set("da", pathname);
    return vestita(NextResponse.redirect(url));
  }

  // Chi è già dentro e apre il modulo d'accesso va al proprio livello,
  // non alla presentazione: `/` adesso è la landing, e rimandarcelo
  // sarebbe rispondere «guarda la brochure» a chi ha chiesto di entrare.
  if (autenticato && pathname === "/accedi") {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return vestita(NextResponse.redirect(url));
  }

  return vestita(response);
}

export const config = {
  /*
   * Senza matcher il proxy girerebbe anche su CSS, immagini e font,
   * bloccandoli dietro l’autenticazione.
   *
   * L’elenco delle estensioni non è una comodità: è la lista di ciò che
   * la pagina pubblica può chiedere senza avere una sessione. Quando ne
   * manca una il guasto è muto e sconcertante — il file risponde 307, il
   * browser segue il rinvio, riceve l’HTML della pagina d’accesso al posto
   * del contenuto, e l’elemento resta lì senza dire perché. È successo con
   * il filmato della landing: la posa si vedeva, perché è un .jpg ed era
   * esclusa, e il video restava fermo perché il .mp4 non lo era.
   *
   * Regola pratica: tutto ciò che sta in `public/` va elencato qui.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|mov|m4v|ogv|mp3|wav|woff2?)$).*)",
  ],
};
