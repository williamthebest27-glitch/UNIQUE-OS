import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/supabase/config";

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
 */
const PUBLIC_EXACT = ["/"];

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
  // Modalità dimostrativa: nessun database, nessuna sessione da proteggere.
  if (!isSupabaseConfigured()) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
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
    return NextResponse.redirect(url);
  }

  // Chi è già dentro e apre il modulo d'accesso va al proprio livello,
  // non alla presentazione: `/` adesso è la landing, e rimandarcelo
  // sarebbe rispondere «guarda la brochure» a chi ha chiesto di entrare.
  if (autenticato && pathname === "/accedi") {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
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
