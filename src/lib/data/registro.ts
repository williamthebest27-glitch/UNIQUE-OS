import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/domain/types";

/**
 * Il registro, letto.
 *
 * Una riga per gesto, in una frase: «William ha visualizzato Marta
 * Bellini alle 10:42». La frase la compone il database — tre join —
 * perché comporla qui avrebbe voluto dire una query per riga, oppure
 * quattro letture e un assemblaggio a mano che va fuori sincrono al
 * primo campo aggiunto.
 *
 * Non c'è nessun controllo di ruolo in questo file, e non servirebbe:
 * `audit_leggibile` è `stable` e non `security definer`, quindi la
 * `select` dentro passa dalle policy di `audit_log`. La direzione vede
 * tutto, un professionista vede le righe dei propri pazienti, e nessuno
 * vede quelle di pazienti che non segue. Se questa funzione fosse
 * sbagliata, Postgres non restituirebbe comunque righe altrui.
 */

export interface RigaRegistroAccessi {
  id: number;
  quando: string;
  attore: string;
  ruolo: AppRole | null;
  azione: string;
  entita: string;
  paziente: string;
  pazienteId: string | null;
  dettagli: Record<string, unknown>;
  /** Falso solo per le righe scritte prima che la catena esistesse. */
  sigillata: boolean;
}

/**
 * Le azioni, in italiano.
 *
 * Un registro leggibile solo da chi conosce i nomi delle azioni è un
 * registro che nessuno legge, e allora tanto vale non tenerlo. Le
 * scritture seguono il formato `tabella.operazione`, quindi si
 * traducono a pezzi: così una tabella nuova produce comunque una frase
 * comprensibile invece di un codice.
 */
const AZIONI: Record<string, string> = {
  "patient.view": "ha aperto la cartella di",
  "patient.section.view": "ha consultato una sezione della cartella di",
  "patient.export": "ha esportato tutti i dati di",
  "patient.erased": "ha cancellato i dati identificativi di",
  "document.view": "ha aperto un referto di",
  "document.review": "ha revisionato un referto di",
  "score.view": "ha consultato il punteggio di",
  "copilot.query": "ha interrogato il copilot su",
  "briefing.view": "ha letto la sintesi pre-visita di",
  "export.view": "ha esportato dati di",
  "communication.opened": "ha aperto una comunicazione",
  "communication.message.sent": "ha scritto un messaggio",
  "communication.read": "ha letto una comunicazione",
  "communication.closed": "ha chiuso una comunicazione",
  "communication.reopened": "ha riaperto una comunicazione",
  "communication.participant.added": "ha aggiunto un partecipante",
  "communication.attachment.added": "ha allegato un file",
  "consultation.requested": "ha richiesto un consulto su",
  "consultation.taken": "ha preso in carico un consulto su",
  "consultation.in_review": "ha messo in valutazione un consulto su",
  "consultation.answered": "ha risposto a un consulto su",
  "consultation.closed": "ha chiuso un consulto su",
};

const TABELLE: Record<string, string> = {
  prescriptions: "la terapia",
  medication_administrations: "una somministrazione",
  lab_orders: "una richiesta di esame",
  clinical_notes: "una nota clinica",
  measurements: "una misura",
  documents: "un documento",
};

const OPERAZIONI: Record<string, string> = {
  insert: "ha aggiunto",
  update: "ha modificato",
  delete: "ha eliminato",
};

/**
 * Da un'azione a una frase.
 *
 * Torna il verbo e l'oggetto separati, perché la pagina mette il nome
 * del paziente in mezzo e ne fa un collegamento: «ha modificato la
 * terapia di **Marta Bellini**».
 */
export function frase(azione: string, entita: string): { verbo: string; oggetto: string } {
  const nota = AZIONI[azione];
  if (nota) return { verbo: nota, oggetto: "" };

  const [tabella, operazione] = azione.split(".");
  const verbo = OPERAZIONI[operazione ?? ""] ?? "ha toccato";
  const oggetto = TABELLE[tabella ?? ""] ?? TABELLE[entita] ?? entita;

  return { verbo, oggetto };
}

/** Vero per i gesti che vale la pena vedere risaltare: sono pochi, e pesano. */
export function eNotevole(azione: string): boolean {
  return (
    azione === "patient.export" ||
    azione === "patient.erased" ||
    azione.endsWith(".delete") ||
    azione === "prescriptions.insert" ||
    azione === "prescriptions.update"
  );
}

export async function getRegistroAccessi(opzioni: {
  pazienteId?: string | null;
  giorni?: number;
  quante?: number;
} = {}): Promise<RigaRegistroAccessi[]> {
  if (!isSupabaseConfigured()) return [];

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return [];

  const supabase = await createSupabaseServerClient();

  const da = new Date(
    Date.now() - (opzioni.giorni ?? 30) * 86_400_000,
  ).toISOString();

  const { data, error } = await supabase.rpc("audit_leggibile", {
    p_patient: opzioni.pazienteId ?? null,
    p_da: da,
    p_quante: opzioni.quante ?? 200,
  });

  if (error) return [];

  return ((data ?? []) as {
    id: number;
    quando: string;
    attore: string;
    ruolo: AppRole | null;
    azione: string;
    entita: string;
    paziente: string;
    patient_id: string | null;
    dettagli: Record<string, unknown> | null;
    sigillata: boolean;
  }[]).map((r) => ({
    id: r.id,
    quando: r.quando,
    attore: r.attore,
    ruolo: r.ruolo,
    azione: r.azione,
    entita: r.entita,
    paziente: r.paziente,
    pazienteId: r.patient_id,
    dettagli: r.dettagli ?? {},
    sigillata: r.sigillata,
  }));
}

/* ── L'integrità ──────────────────────────────────────────────────── */

export interface EsitoVerifica {
  /** Vero se la catena non ha rotture. */
  integra: boolean;
  rotture: { id: number; quando: string }[];
  /** Falso quando la verifica non è stata possibile — non è un guasto. */
  eseguita: boolean;
  motivo: string | null;
}

/**
 * Verificare la catena.
 *
 * Un risultato vuoto **è** la prova: ogni impronta ricalcolata coincide
 * con quella scritta, quindi nessuna riga è stata cambiata da quando è
 * stata scritta. Non è una probabilità — o le impronte tornano tutte, o
 * si sa esattamente da quale riga in poi non tornano più.
 *
 * L'errore non si nasconde e non si trasforma in «tutto a posto»: un
 * registro che dice «integro» quando non ha potuto controllare è
 * peggio di uno che non dice niente.
 */
export async function verificaCatena(): Promise<EsitoVerifica> {
  if (!isSupabaseConfigured()) {
    return { integra: false, rotture: [], eseguita: false, motivo: "Database non collegato." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("verify_audit_chain", {
    p_da: null,
    p_quante: 20000,
  });

  if (error) {
    return {
      integra: false,
      rotture: [],
      eseguita: false,
      motivo: "La verifica è riservata alla direzione.",
    };
  }

  const rotture = ((data ?? []) as { id: number; quando: string }[]).map((r) => ({
    id: r.id,
    quando: r.quando,
  }));

  return {
    integra: rotture.length === 0,
    rotture,
    eseguita: true,
    motivo: null,
  };
}
