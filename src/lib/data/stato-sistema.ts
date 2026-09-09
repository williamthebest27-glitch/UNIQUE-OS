import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ETICHETTA_MOTORE, motoreConversazione } from "@/lib/brain/fornitore";

/**
 * Lo stato del sistema, non quello della clinica.
 *
 * `data/stato-clinica.ts` risponde a «come va la giornata»: pazienti,
 * code cliniche, urgenze. Questo file risponde a un'altra domanda, che
 * nel Control Center non se la faceva nessuno: **le cose funzionano?**
 *
 * Sono due domande diverse e si guardano in momenti diversi. Un referto
 * che il motore non è riuscito a leggere non è una coda clinica — non è
 * fermo perché manca una decisione, è fermo perché qualcosa si è rotto —
 * e finché nessuna schermata lo dice resta fermo per sempre. Lo stesso
 * vale per un webhook che fallisce da tre giorni verso il gestionale:
 * l'applicazione continua a funzionare benissimo, e le prenotazioni non
 * arrivano più.
 *
 * **Ogni numero qui è un conteggio vero.** Dove non c'è niente da
 * contare la voce compare comunque, a zero e in tono neutro: una riga
 * che sparisce quando è a posto insegna a non fidarsi dell'assenza.
 *
 * Nessun controllo di ruolo, e non serve: ogni conteggio passa dalla Row
 * Level Security della tabella che conta. Chi non ha titolo vede zeri,
 * non i numeri di qualcun altro. Il ruolo decide se la voce compare nel
 * menu — `CONTROL_SECTIONS` — che è una questione di interfaccia.
 */

export type TonoSegnale = "buono" | "attesa" | "grave" | "spento";

export interface SegnaleSistema {
  chiave: string;
  etichetta: string;
  /** Il valore da mostrare, già in forma leggibile. */
  valore: string;
  /** Cosa significa, per chi non ha scritto la query. */
  nota: string;
  tono: TonoSegnale;
  /** Dove si va a sistemare, quando esiste una pagina. */
  href: string | null;
}

export interface StatoSistema {
  gruppi: { titolo: string; segnali: SegnaleSistema[] }[];
  /** Vero se almeno un segnale è grave: serve al riassunto in testa. */
  qualcosaNonVa: boolean;
}

/** Quanti minuti può restare un documento in lavorazione prima di essere «piantato». */
const LAVORAZIONE_MAX_MINUTI = 30;

/** Oltre questo, un endpoint che non risponde da troppo tempo. */
const SILENZIO_INTEGRAZIONE_ORE = 48;

export async function getStatoSistema(): Promise<StatoSistema | null> {
  if (!isSupabaseConfigured()) return null;

  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createSupabaseServerClient();

  const orizzonteLavorazione = new Date(
    Date.now() - LAVORAZIONE_MAX_MINUTI * 60_000,
  ).toISOString();
  const orizzonteSilenzio = new Date(
    Date.now() - SILENZIO_INTEGRAZIONE_ORE * 3_600_000,
  ).toISOString();

  /*
   * Tutto in parallelo.
   *
   * Sono nove conteggi su nove tabelle diverse, e nessuno dipende dal
   * precedente: in fila sarebbero nove viaggi verso il database uno
   * dopo l'altro, su una pagina che si ricarica a ogni evento. Con
   * `head: true` non torna nemmeno una riga — solo il numero.
   */
  const [
    documentiFalliti,
    documentiPiantati,
    daRevisionare,
    propostePendenti,
    endpointAttivi,
    consegneFallite,
    integrazioniMute,
    filiSenzaRisposta,
    consultiAperti,
  ] = await Promise.all([
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("processing_state", "FAILED"),

    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .in("processing_state", ["PROCESSING", "OCR", "EXTRACTING", "ANALYZING"])
      .lt("created_at", orizzonteLavorazione),

    supabase
      .from("document_extractions")
      .select("id", { count: "exact", head: true })
      .eq("requires_review", true),

    supabase
      .from("brain_proposals")
      .select("id", { count: "exact", head: true })
      .eq("state", "pending"),

    supabase
      .from("webhook_endpoints")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),

    supabase
      .from("webhook_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),

    supabase
      .from("webhook_endpoints")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .or(`last_success_at.is.null,last_success_at.lt.${orizzonteSilenzio}`),

    // Un filo aperto la cui ultima parola è del paziente: la query
    // completa sta in `data/messaggi.ts`, qui basta il numero dei fili
    // con almeno un messaggio del paziente che nessuno ha aperto.
    supabase
      .from("messages")
      .select("thread_id", { count: "exact", head: true })
      .eq("from_patient", true)
      .is("read_by_staff_at", null),

    supabase
      .from("clinical_consultations")
      .select("id", { count: "exact", head: true })
      // Aperto, preso in carico o in valutazione: tutto ciò che non ha
      // ancora una risposta. `answered` e `closed` sono finiti.
      .in("status", ["open", "taken", "in_review"]),
  ]);

  const n = (r: { count: number | null }) => r.count ?? 0;

  const motore = motoreConversazione();

  const gruppi: StatoSistema["gruppi"] = [
    {
      titolo: "Documenti",
      segnali: [
        {
          chiave: "documenti-falliti",
          etichetta: "Letture fallite",
          valore: String(n(documentiFalliti)),
          nota: "Referti che il motore non è riuscito ad aprire. Vanno riletti a mano.",
          tono: n(documentiFalliti) > 0 ? "grave" : "buono",
          href: "/pro/revisioni",
        },
        {
          chiave: "documenti-piantati",
          etichetta: "In lavorazione da troppo",
          valore: String(n(documentiPiantati)),
          nota: `Fermi in pipeline da più di ${LAVORAZIONE_MAX_MINUTI} minuti.`,
          tono: n(documentiPiantati) > 0 ? "grave" : "buono",
          href: "/pro/revisioni",
        },
        {
          chiave: "da-revisionare",
          etichetta: "Estrazioni da rivedere",
          valore: String(n(daRevisionare)),
          nota: "Valori letti dal motore che aspettano l'occhio di un clinico.",
          tono: n(daRevisionare) > 0 ? "attesa" : "buono",
          href: "/pro/revisioni",
        },
      ],
    },
    {
      titolo: "Comunicazioni",
      segnali: [
        {
          chiave: "fili-senza-risposta",
          etichetta: "Messaggi non aperti",
          valore: String(n(filiSenzaRisposta)),
          nota: "Righe scritte da pazienti che nessuno in clinica ha ancora letto.",
          tono: n(filiSenzaRisposta) > 0 ? "attesa" : "buono",
          href: "/pro/messaggi",
        },
        {
          chiave: "consulti-aperti",
          etichetta: "Consulti aperti",
          valore: String(n(consultiAperti)),
          nota: "Richieste fra reparti non ancora chiuse.",
          tono: n(consultiAperti) > 0 ? "attesa" : "buono",
          href: "/pro/comunicazioni/consulti",
        },
      ],
    },
    {
      titolo: "Brain",
      segnali: [
        {
          chiave: "motore",
          etichetta: "Motore attivo",
          valore: ETICHETTA_MOTORE[motore],
          nota:
            motore === "anthropic"
              ? "Modello esterno: i testi inviati escono dall'infrastruttura."
              : motore === "ollama"
                ? "Modello sul server della clinica. Nessun dato esce."
                : "Motore proprietario: nessuna rete, nessun dato che esce.",
          // Non è un guasto in nessuno dei tre casi: è una scelta, e va
          // solo saputa. Il tono resta neutro.
          tono: "spento",
          href: "/control/brain",
        },
        {
          chiave: "proposte",
          etichetta: "Proposte da approvare",
          valore: String(n(propostePendenti)),
          nota: "Azioni che il Brain ha preparato e che aspettano un sì.",
          tono: n(propostePendenti) > 0 ? "attesa" : "buono",
          href: "/control/approvazioni",
        },
      ],
    },
    {
      titolo: "Integrazioni",
      segnali: [
        {
          chiave: "endpoint",
          etichetta: "Destinazioni attive",
          valore: String(n(endpointAttivi)),
          nota: "Sistemi esterni che ricevono gli eventi di Unique.",
          tono: "spento",
          href: null,
        },
        {
          chiave: "consegne-fallite",
          etichetta: "Consegne fallite",
          valore: String(n(consegneFallite)),
          nota: "Eventi che non sono arrivati a destinazione dopo i tentativi.",
          tono: n(consegneFallite) > 0 ? "grave" : "buono",
          href: null,
        },
        {
          chiave: "integrazioni-mute",
          etichetta: "Silenziose",
          valore: String(n(integrazioniMute)),
          nota: `Destinazioni attive senza una consegna riuscita da ${SILENZIO_INTEGRAZIONE_ORE} ore.`,
          tono: n(integrazioniMute) > 0 ? "attesa" : "buono",
          href: null,
        },
      ],
    },
  ];

  return {
    gruppi,
    qualcosaNonVa: gruppi.some((g) => g.segnali.some((s) => s.tono === "grave")),
  };
}
