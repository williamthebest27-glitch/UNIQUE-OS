import { NextResponse, type NextRequest } from "next/server";
import { requireProfile } from "@/lib/auth";
import { traccia } from "@/lib/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Aprire il documento originale.
 *
 * Il file non si serve da qui e non si copia da nessuna parte: si
 * chiede a Supabase un **collegamento firmato** e ci si manda chi ha
 * chiesto. La firma scade, il collegamento non si può indovinare, e il
 * bucket resta privato — non esiste nessun indirizzo pubblico di un
 * documento sanitario, e questa rotta serve proprio a non doverne
 * creare uno.
 *
 * ---
 *
 * **Perché una rotta e non un collegamento diretto allo storage.**
 * Perché tre cose devono succedere prima che il file si apra, e nessuna
 * delle tre potrebbe succedere in un `<a href>`:
 *
 *   Il controllo di accesso passa dalla Row Level Security su
 *   `documents`. Se la riga non torna, chi chiede non ha titolo: la
 *   risposta è 404 e non 403, perché dire «esiste ma non puoi» è già
 *   dire qualcosa su un dato sanitario.
 *
 *   L'accesso finisce nel registro. Aprire un referto senza toccare
 *   niente non produce nessun evento di dominio, ed è esattamente
 *   l'accesso che l'art. 32 chiede di poter mostrare.
 *
 *   La firma dura poco. Un collegamento che resta valido un giorno è un
 *   collegamento che finisce in una cronologia, in una chat, in un log
 *   di un proxy aziendale.
 *
 * Vale per entrambi i lati: il paziente apre i propri referti, il
 * professionista quelli dei pazienti che segue, e la stessa policy —
 * `can_access_patient` — decide per tutti e due.
 */

const BUCKET = "patient-documents";

/**
 * Quanto vive il collegamento firmato.
 *
 * Cinque minuti: il tempo di aprire il file, non di conservarlo. Chi
 * torna sulla pagina ne riceve uno nuovo, e questo è gratis.
 */
const DURATA_FIRMA_SECONDI = 300;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // `requireProfile` porta al login chi non ha sessione. Su una rotta
  // che restituisce un file è il comportamento giusto: si torna qui
  // dopo aver fatto l'accesso.
  const profile = await requireProfile();
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("documents")
    .select("id, patient_id, title, storage_path, mime_type")
    .eq("id", id)
    .maybeSingle();

  const documento = data as {
    id: string;
    patient_id: string;
    title: string;
    storage_path: string;
    mime_type: string | null;
  } | null;

  if (!documento) {
    // Volutamente indistinguibile da «non esiste». Un 403 confermerebbe
    // che quel documento c'è, e su dati sanitari è già un'informazione.
    return NextResponse.json({ errore: "Documento non trovato." }, { status: 404 });
  }

  const { data: firmato, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(documento.storage_path, DURATA_FIRMA_SECONDI, {
      // `scarica` decide fra aprire nel browser e salvare sul disco. Il
      // valore predefinito è aprire: su un telefono, dove il paziente
      // fotografa e ricontrolla, un download è un passaggio in più che
      // finisce in una cartella che nessuno riapre.
      download:
        request.nextUrl.searchParams.get("scarica") === "1" ? documento.title : undefined,
    });

  if (error || !firmato?.signedUrl) {
    console.error("[documenti] firma non riuscita:", error?.message);
    return NextResponse.json(
      { errore: "Il documento non è al momento disponibile." },
      { status: 502 },
    );
  }

  traccia({
    azione: "document.view",
    entita: "document",
    patientId: documento.patient_id,
    entityId: documento.id,
    dettagli: { ruolo: profile.role },
  });

  // Nessuna cache, da nessuna parte. Un collegamento firmato memorizzato
  // da un proxy sarebbe un documento sanitario lasciato in una cartella
  // condivisa.
  return NextResponse.redirect(firmato.signedUrl, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
}
