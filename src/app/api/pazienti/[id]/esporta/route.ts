import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Portabilità: tutti i dati di una persona, in un file.
 *
 * Art. 20 del GDPR. È una rotta e non un'azione server per una ragione
 * pratica e una di sostanza. Pratica: un'azione non può impostare
 * `Content-Disposition`, quindi il JSON finirebbe dentro la pagina
 * invece che nella cartella dei download. Di sostanza: un'esportazione
 * è una **risorsa**, ha un indirizzo, e quell'indirizzo può essere
 * chiesto anche da fuori — un incaricato del trattamento che deve
 * consegnare i dati non deve passare da un'interfaccia.
 *
 * Il controllo di accesso non è qui: `export_patient_data` è
 * `security definer` e chiede `can_access_patient` prima di comporre
 * qualunque cosa. Questa rotta non decide niente — chiede, e riceve un
 * errore se non ha titolo.
 *
 * L'esportazione lascia una riga nel registro. Un accesso massivo ai
 * dati di una persona è esattamente ciò che va tracciato, e vale anche
 * quando quella persona è chi lo sta chiedendo.
 */
export async function GET(
  richiesta: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ errore: "Database non collegato." }, { status: 503 });
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("export_patient_data", { p_patient: id });

  if (error) {
    // Il messaggio della funzione è già scritto per essere letto: «Paziente
    // non accessibile.» dice quello che serve senza dire se esiste.
    return NextResponse.json({ errore: error.message }, { status: 403 });
  }

  const nome = `unique-dati-${id.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      // Un file con dentro una cartella clinica non si mette in cache
      // da nessuna parte, nemmeno per un istante.
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
}
