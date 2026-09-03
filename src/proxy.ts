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

/** Percorsi raggiungibili senza sessione. */
// /api/integrazioni parla con il gestionale, non con una persona: si
// autentica con un token proprio, non con un cookie di sessione.
const PUBLIC_PREFIXES = ["/accedi", "/auth", "/api/integrazioni"];

function isPublicPath(pathname: string): boolean {
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

  // getUser() valida il token contro Supabase e, se serve, lo rinnova.
  // getSession() leggerebbe soltanto il cookie, di cui non ci si può fidare.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/accedi";
    url.search = "";
    // Ricordiamo dove voleva andare, per riportarlo lì dopo l’accesso.
    if (pathname !== "/") url.searchParams.set("da", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/accedi") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Senza matcher il proxy girerebbe anche su CSS, immagini e font,
  // bloccandoli dietro l’autenticazione.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
