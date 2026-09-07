import { getCurrentProfile } from "@/lib/auth";
import { recentEvents } from "@/lib/events/emit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Lo stato operativo della clinica.
 *
 * **Da non confondere con `data/comando.ts`**, che compone `/pro` — la
 * giornata di *chi guarda*, filtrata dal suo care team. Questo file
 * risponde a un'altra domanda: cosa sta succedendo *nella clinica*, che
 * è una cifra diversa e vera solo per chi ha titolo sull'intera
 * struttura. Le due schermate si somigliano e non si sostituiscono.
 *
 * Due letture e non dieci: `command_center()` porta tutti i conteggi in
 * un viaggio, `recentEvents()` porta il feed. La schermata si aggiorna
 * in tempo reale, e ogni evento la ridisegna: dieci query per render
 * sarebbero diventate dieci query per messaggio scritto in clinica.
 *
 * **Non c'è nessun controllo di ruolo qui dentro, e non servirebbe.**
 * `command_center()` ha i diritti dell'invocante: i conteggi passano
 * dalle policy delle tabelle che contano, e `domain_events` ha la sua.
 * Chi arrivasse su questa pagina senza titolo vedrebbe zeri, non i
 * numeri di qualcun altro. Il controllo di ruolo che c'è — in
 * `CONTROL_SECTIONS` — decide se la voce compare nel menu, che è una
 * questione di interfaccia e non di accesso.
 */

/** Una coda: quante cose sono ferme, e dove si va a smaltirle. */
export interface Coda {
  chiave: string;
  etichetta: string;
  /** Cosa significa il numero, per chi non ha costruito la tabella. */
  nota: string;
  quante: number;
  /**
   * La pagina dove si smaltisce, quando ne esiste una.
   *
   * `null` per le code che non hanno una schermata propria — il giro
   * delle somministrazioni e il laboratorio vivono dentro il cruscotto
   * di chi ci lavora, e mandare la direzione al *proprio* cruscotto le
   * mostrerebbe un'altra cosa. Le righe qui sotto portano comunque in
   * cartella, che è dove si agisce davvero.
   */
  href: string | null;
  /** `grave` solo per ciò che riguarda una cosa già successa. */
  tono: "neutro" | "attesa" | "grave";
}

export interface RigaAttivita {
  id: number;
  /** Il nome grezzo dell'evento: la frase la compone `descriviEvento`. */
  nome: string;
  quando: string;
}

export interface StatoClinica {
  pazienti: number;
  oggi: number;
  urgenti: number;
  code: Coda[];
  attivita: RigaAttivita[];
  /** Somma delle code: il numero che dice se la giornata è in pari. */
  arretrato: number;
}

/**
 * L'ordine delle code non è alfabetico ed è la sola cosa progettata di
 * questo elenco: scende da «nessuno l'ha preso in carico» a «qualcuno
 * ci sta lavorando». Una coda senza proprietario è in ritardo di
 * nessuno, ed è la sola che non si smaltisce da sé.
 */
const CODE: readonly Omit<Coda, "quante">[] = [
  {
    chiave: "consulti",
    etichetta: "Richieste da prendere in carico",
    nota: "Pareri chiesti a un reparto, ancora senza un nome accanto.",
    href: "/pro/comunicazioni/consulti",
    tono: "grave",
  },
  {
    chiave: "dosi",
    etichetta: "Dosi scadute non registrate",
    nota: "L'orario è passato e nessuno ha scritto niente: non è «non data», è «non si sa».",
    href: null,
    tono: "grave",
  },
  {
    chiave: "validazioni",
    etichetta: "Risultati da validare",
    nota: "Numeri usciti da uno strumento, non ancora numeri di cui qualcuno risponde.",
    href: null,
    tono: "attesa",
  },
  {
    chiave: "prelievi",
    etichetta: "Prelievi da eseguire",
    nota: "Esami richiesti e mai eseguiti.",
    href: null,
    tono: "attesa",
  },
  {
    chiave: "valori",
    etichetta: "Valori da approvare",
    nota: "Letti da un referto, in attesa di un professionista.",
    href: "/pro/revisioni",
    tono: "attesa",
  },
  {
    chiave: "referti",
    etichetta: "Referti letti, mai confermati",
    nota: "L'OCR li ha aperti; nessuno li ha ancora portati in cartella.",
    href: "/pro/revisioni",
    tono: "neutro",
  },
];

const VUOTO: StatoClinica = {
  pazienti: 0,
  oggi: 0,
  urgenti: 0,
  code: CODE.map((c) => ({ ...c, quante: 0 })),
  attivita: [],
  arretrato: 0,
};

function numero(fonte: unknown, chiave: string): number {
  if (!fonte || typeof fonte !== "object") return 0;
  const valore = (fonte as Record<string, unknown>)[chiave];
  return typeof valore === "number" && Number.isFinite(valore) ? valore : 0;
}

export async function getStatoClinica(): Promise<StatoClinica> {
  if (!isSupabaseConfigured()) return VUOTO;

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return VUOTO;

  const supabase = await createSupabaseServerClient();

  const [conteggi, eventi] = await Promise.all([
    supabase.rpc("command_center"),
    recentEvents({ limit: 12, client: supabase }),
  ]);

  // Un errore qui non è una pagina rotta: è una pagina che dice zero.
  // Preferibile a un 500 su una schermata che qualcuno tiene aperta
  // tutto il giorno su un monitor.
  const stato = conteggi.error ? null : conteggi.data;
  const code = (stato as { code?: unknown } | null)?.code ?? null;

  const conCifre = CODE.map((c) => ({ ...c, quante: numero(code, c.chiave) }));

  return {
    pazienti: numero(stato, "pazienti"),
    oggi: numero(stato, "oggi"),
    urgenti: numero(stato, "urgenti"),
    code: conCifre,
    arretrato: conCifre.reduce((somma, c) => somma + c.quante, 0),
    attivita: eventi.map((e) => ({
      id: e.id,
      nome: e.eventName,
      quando: e.occurredAt,
    })),
  };
}

/** Una riga dietro un conteggio. */
export interface RigaCoda {
  id: string;
  pazienteId: string | null;
  paziente: string;
  titolo: string;
  dettaglio: string;
  quando: string;
}

/**
 * Le righe di una coda, aperte su richiesta.
 *
 * Non arrivano con la pagina: sei code caricate tutte insieme sono sei
 * elenchi che nessuno guarda per aprirne uno. Arrivano quando qualcuno
 * apre quel conteggio — che è anche il momento in cui è giusto pagarle.
 */
export async function getRigheCoda(coda: string): Promise<RigaCoda[]> {
  if (!isSupabaseConfigured()) return [];

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("command_center_queue", {
    p_coda: coda,
    p_quante: 12,
  });

  if (error || !Array.isArray(data)) return [];

  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id ?? ""),
    pazienteId: typeof r.patient === "string" ? r.patient : null,
    // Un paziente che chi guarda non può vedere non diventa un vuoto
    // silenzioso: la riga dice che c'è e che il nome non spetta.
    paziente: typeof r.paziente === "string" && r.paziente ? r.paziente : "Nome non accessibile",
    titolo: typeof r.titolo === "string" && r.titolo ? r.titolo : "—",
    dettaglio: typeof r.dettaglio === "string" ? r.dettaglio : "",
    quando: typeof r.quando === "string" ? r.quando : "",
  }));
}
