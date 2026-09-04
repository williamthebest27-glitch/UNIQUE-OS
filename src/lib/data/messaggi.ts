import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Le conversazioni, viste da questa parte del filo.
 *
 * Il paziente le legge da `data/paziente-sezioni.ts`; qui le legge chi
 * risponde. Sono le stesse righe e le stesse funzioni di scrittura —
 * `send_message` e `open_thread` funzionano in entrambe le direzioni —
 * ma la domanda è diversa: il paziente vuole sapere se gli hanno
 * risposto, il professionista quali fili aspettano lui.
 *
 * **La categoria decide chi legge**, e non è un'etichetta di comodo: un
 * filo clinico lo vedono il paziente e il suo care team, uno
 * amministrativo lo vede anche la reception. La separazione è nella Row
 * Level Security, non in questo file — qui serve solo a non mescolare
 * due code di lavoro che sono di due persone diverse.
 */

export type CategoriaFilo = "clinical" | "administrative";

export interface FiloClinico {
  id: string;
  patientId: string;
  paziente: string;
  oggetto: string;
  categoria: CategoriaFilo;
  chiuso: boolean;
  ultimoIl: string;
  /** Messaggi scritti dal paziente che nessuno di noi ha ancora aperto. */
  nonLetti: number;
  /** L'ultima riga, per capire di cosa si parla senza aprire. */
  anteprima: string | null;
  /** Vero se l'ultima parola è del paziente: allora tocca a noi. */
  toccaANoi: boolean;
}

export interface MessaggioClinico {
  id: string;
  dalPaziente: boolean;
  autore: string | null;
  corpo: string;
  documentId: string | null;
  quando: string;
  lettoDalPaziente: string | null;
}

interface RigaFilo {
  id: string;
  patient_id: string;
  subject: string;
  category: CategoriaFilo;
  is_closed: boolean;
  last_message_at: string;
  patient: { profile: { full_name: string } | null } | null;
}

/**
 * Tutti i fili aperti dei pazienti seguiti.
 *
 * Ordinati per ultimo messaggio e non per non-letti: una conversazione
 * a cui si è già risposto ma che è ancora viva vale più di una vecchia
 * con un pallino sopra.
 */
export async function getFiliClinici(soloAperti = true): Promise<FiloClinico[]> {
  if (!isSupabaseConfigured()) return [];

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return [];

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("message_threads")
    .select(
      "id, patient_id, subject, category, is_closed, last_message_at, patient:patients(profile:profiles(full_name))",
    )
    .order("last_message_at", { ascending: false })
    .limit(80);

  if (soloAperti) query = query.eq("is_closed", false);

  const { data } = await query;
  const fili = (data ?? []) as unknown as RigaFilo[];
  if (fili.length === 0) return [];

  const ids = fili.map((f) => f.id);

  // Un'unica lettura dei messaggi recenti di tutti i fili: serve sia a
  // contare i non letti sia a comporre l'anteprima, e sono la stessa
  // tabella. Due query direbbero la stessa cosa due volte.
  const { data: messaggi } = await supabase
    .from("messages")
    .select("thread_id, body, from_patient, read_by_staff_at, created_at")
    .in("thread_id", ids)
    .order("created_at", { ascending: false })
    .limit(600);

  const conteggi = new Map<string, number>();
  const ultimi = new Map<string, { body: string; from_patient: boolean }>();

  for (const m of (messaggi ?? []) as {
    thread_id: string;
    body: string;
    from_patient: boolean;
    read_by_staff_at: string | null;
    created_at: string;
  }[]) {
    if (!ultimi.has(m.thread_id)) {
      ultimi.set(m.thread_id, { body: m.body, from_patient: m.from_patient });
    }
    if (m.from_patient && m.read_by_staff_at === null) {
      conteggi.set(m.thread_id, (conteggi.get(m.thread_id) ?? 0) + 1);
    }
  }

  return fili.map((f) => {
    const ultimo = ultimi.get(f.id) ?? null;
    return {
      id: f.id,
      patientId: f.patient_id,
      paziente: f.patient?.profile?.full_name ?? "Paziente",
      oggetto: f.subject,
      categoria: f.category,
      chiuso: f.is_closed,
      ultimoIl: f.last_message_at,
      nonLetti: conteggi.get(f.id) ?? 0,
      anteprima: ultimo
        ? ultimo.body.length > 140
          ? `${ultimo.body.slice(0, 140)}…`
          : ultimo.body
        : null,
      toccaANoi: ultimo?.from_patient ?? false,
    };
  });
}

/** I fili di un paziente solo, per la sua cartella. */
export async function getFiliDelPaziente(patientId: string): Promise<FiloClinico[]> {
  const tutti = await getFiliClinici(false);
  return tutti.filter((f) => f.patientId === patientId);
}

export interface ConversazioneClinica {
  filo: FiloClinico;
  messaggi: MessaggioClinico[];
}

/**
 * Un filo con dentro tutte le sue righe.
 *
 * Non segna niente come letto: farlo qui significherebbe che aprire il
 * filo in una scheda del browser lo marca letto per tutto il team,
 * anche se chi l'ha aperto poi non risponde. Segnare è un gesto, e sta
 * in un'azione.
 */
export async function getConversazione(
  threadId: string,
): Promise<ConversazioneClinica | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();

  const [filoRes, messaggiRes] = await Promise.all([
    supabase
      .from("message_threads")
      .select(
        "id, patient_id, subject, category, is_closed, last_message_at, patient:patients(profile:profiles(full_name))",
      )
      .eq("id", threadId)
      .maybeSingle(),

    supabase
      .from("messages")
      .select(
        "id, from_patient, body, document_id, created_at, read_by_patient_at, read_by_staff_at, author:profiles(full_name)",
      )
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(300),
  ]);

  const riga = filoRes.data as unknown as RigaFilo | null;
  if (!riga) return null;

  const messaggi = ((messaggiRes.data ?? []) as unknown as {
    id: string;
    from_patient: boolean;
    body: string;
    document_id: string | null;
    created_at: string;
    read_by_patient_at: string | null;
    read_by_staff_at: string | null;
    author: { full_name: string } | null;
  }[]).map((m) => ({
    id: m.id,
    dalPaziente: m.from_patient,
    autore: m.author?.full_name ?? null,
    corpo: m.body,
    documentId: m.document_id,
    quando: m.created_at,
    lettoDalPaziente: m.read_by_patient_at,
  }));

  const ultimo = messaggi.at(-1) ?? null;

  return {
    filo: {
      id: riga.id,
      patientId: riga.patient_id,
      paziente: riga.patient?.profile?.full_name ?? "Paziente",
      oggetto: riga.subject,
      categoria: riga.category,
      chiuso: riga.is_closed,
      ultimoIl: riga.last_message_at,
      nonLetti: 0,
      anteprima: null,
      toccaANoi: ultimo?.dalPaziente ?? false,
    },
    messaggi,
  };
}
