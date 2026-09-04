import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * L'agenda clinica, in tre scale.
 *
 * Giorno, settimana e mese non sono tre viste dello stesso elenco: sono
 * tre domande diverse, e la quantità di dettaglio giusta cambia con
 * ciascuna.
 *
 *   **Giorno** — «chi entra adesso». Serve tutto: durata, stanza,
 *   professionista, se la cartella è preparata, se sono arrivati referti.
 *
 *   **Settimana** — «come è messa la settimana». Serve l'ora, il nome e
 *   il tipo di visita. Il resto è rumore.
 *
 *   **Mese** — «quando ho spazio». Serve solo quante visite per giorno.
 *   Mostrare i nomi su trenta giorni produce una parete di testo che
 *   nessuno legge.
 *
 * Tutti i fusi passano da `Europe/Rome`: l'agenda è quella della
 * clinica, non quella del server.
 */

export type VistaAgenda = "giorno" | "settimana" | "mese";

export interface VisitaInAgenda {
  id: string;
  patientId: string;
  paziente: string;
  servizio: string;
  iniziaAlle: string;
  finisceAlle: string | null;
  durataMin: number | null;
  luogo: string | null;
  stanza: string | null;
  professionista: string | null;
  stato: string;
  crediti: number;
  /** Vero se la cartella ha già una sintesi pre-visita recente. */
  preparata: boolean;
  /** Referti arrivati e non ancora aperti, per questo paziente. */
  refertiDaLeggere: number;
  /** Vero se l'ora è passata e l'esito non è stato registrato. */
  senzaEsito: boolean;
}

export interface GiornoInAgenda {
  /** `YYYY-MM-DD` a Roma. */
  data: string;
  visite: VisitaInAgenda[];
}

export interface AgendaClinica {
  vista: VistaAgenda;
  /** Il giorno su cui è centrata la vista, `YYYY-MM-DD`. */
  ancora: string;
  /** Estremi inclusivi del periodo mostrato. */
  da: string;
  a: string;
  giorni: GiornoInAgenda[];
  totale: number;
  /** Le visite passate a cui manca l'esito, in tutto il periodo. */
  senzaEsito: number;
}

const ROMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function oggiRoma(): string {
  return ROMA.format(new Date());
}

function dataRomana(iso: string): string {
  return ROMA.format(new Date(iso));
}

function giorno(data: string, delta: number): string {
  return new Date(Date.parse(`${data}T12:00:00Z`) + delta * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Il lunedì della settimana di una data.
 *
 * `getUTCDay()` conta da domenica; qui la settimana comincia di lunedì,
 * come su ogni calendario italiano.
 */
export function lunediDi(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  const spostamento = (d.getUTCDay() + 6) % 7;
  return giorno(data, -spostamento);
}

/** Il periodo coperto da una vista, estremi inclusi. */
export function periodoDi(vista: VistaAgenda, ancora: string): { da: string; a: string } {
  if (vista === "giorno") return { da: ancora, a: ancora };
  if (vista === "settimana") {
    const lunedi = lunediDi(ancora);
    return { da: lunedi, a: giorno(lunedi, 6) };
  }
  const primo = `${ancora.slice(0, 7)}-01`;
  const dopo = new Date(Date.parse(`${primo}T12:00:00Z`));
  dopo.setUTCMonth(dopo.getUTCMonth() + 1);
  return { da: primo, a: giorno(dopo.toISOString().slice(0, 10), -1) };
}

/** La stessa vista, un periodo avanti o indietro. */
export function spostaAncora(vista: VistaAgenda, ancora: string, passi: number): string {
  if (vista === "giorno") return giorno(ancora, passi);
  if (vista === "settimana") return giorno(lunediDi(ancora), passi * 7);
  const d = new Date(Date.parse(`${ancora.slice(0, 7)}-01T12:00:00Z`));
  d.setUTCMonth(d.getUTCMonth() + passi);
  return d.toISOString().slice(0, 10);
}

interface RigaAppuntamento {
  id: string;
  patient_id: string;
  service_name: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  status: string;
  credits_cost: number | string;
  patient: { profile: { full_name: string } | null } | null;
  professional: { title: string | null; profiles: { full_name: string } | null } | null;
  room: { name: string } | null;
}

export async function getAgendaClinica(
  vista: VistaAgenda = "giorno",
  ancora?: string,
): Promise<AgendaClinica> {
  const centro = ancora ?? oggiRoma();
  const { da, a } = periodoDi(vista, centro);

  const vuota: AgendaClinica = {
    vista,
    ancora: centro,
    da,
    a,
    giorni: [],
    totale: 0,
    senzaEsito: 0,
  };

  if (!isSupabaseConfigured()) return vuota;

  const supabase = await createSupabaseServerClient();

  // Un giorno di margine per lato: `starts_at` è un istante UTC e il
  // confine di giornata a Roma non coincide. Il taglio vero lo fa il
  // raggruppamento qui sotto, che ragiona in date romane.
  const daIso = `${giorno(da, -1)}T00:00:00Z`;
  const aIso = `${giorno(a, 1)}T23:59:59Z`;

  const [visiteRes, briefingRes, refertiRes] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, patient_id, service_name, starts_at, ends_at, location, status, credits_cost, " +
          "patient:patients(profile:profiles(full_name)), " +
          "professional:professionals(title, profiles(full_name)), " +
          "room:rooms(name)",
      )
      .in("status", ["scheduled", "confirmed", "completed", "no_show"])
      .gte("starts_at", daIso)
      .lte("starts_at", aIso)
      .order("starts_at", { ascending: true })
      .limit(600),

    supabase
      .from("patient_briefings")
      .select("patient_id")
      .gte("created_at", new Date(Date.now() - 5 * 86_400_000).toISOString())
      .limit(300),

    supabase
      .from("documents")
      .select("patient_id")
      .eq("review_state", "pending")
      .limit(400),
  ]);

  const preparati = new Set(
    ((briefingRes.data ?? []) as { patient_id: string }[]).map((b) => b.patient_id),
  );

  const referti = new Map<string, number>();
  for (const d of (refertiRes.data ?? []) as { patient_id: string }[]) {
    referti.set(d.patient_id, (referti.get(d.patient_id) ?? 0) + 1);
  }

  const adesso = Date.now();
  const gruppi = new Map<string, VisitaInAgenda[]>();
  let senzaEsito = 0;

  for (const r of (visiteRes.data ?? []) as unknown as RigaAppuntamento[]) {
    const data = dataRomana(r.starts_at);
    if (data < da || data > a) continue;

    const inizio = Date.parse(r.starts_at);
    const fine = r.ends_at ? Date.parse(r.ends_at) : null;

    const aperta =
      ["scheduled", "confirmed"].includes(r.status) && inizio < adesso;
    if (aperta) senzaEsito += 1;

    const visita: VisitaInAgenda = {
      id: r.id,
      patientId: r.patient_id,
      paziente: r.patient?.profile?.full_name ?? "Paziente",
      servizio: r.service_name,
      iniziaAlle: r.starts_at,
      finisceAlle: r.ends_at,
      durataMin: fine ? Math.round((fine - inizio) / 60_000) : null,
      luogo: r.location,
      stanza: r.room?.name ?? null,
      professionista: r.professional?.profiles?.full_name
        ? [r.professional.title, r.professional.profiles.full_name]
            .filter(Boolean)
            .join(" ")
        : null,
      stato: r.status,
      crediti: Number(r.credits_cost),
      preparata: preparati.has(r.patient_id),
      refertiDaLeggere: referti.get(r.patient_id) ?? 0,
      senzaEsito: aperta,
    };

    gruppi.set(data, [...(gruppi.get(data) ?? []), visita]);
  }

  /*
   * I giorni vuoti restano nell'elenco.
   *
   * Su una settimana e su un mese servono: «giovedì non ho niente» è
   * un'informazione, e un calendario che salta i giorni vuoti costringe
   * a leggere le date per capire quali mancano.
   */
  const giorni: GiornoInAgenda[] = [];
  for (let data = da; data <= a; data = giorno(data, 1)) {
    giorni.push({ data, visite: gruppi.get(data) ?? [] });
  }

  return {
    vista,
    ancora: centro,
    da,
    a,
    giorni,
    totale: [...gruppi.values()].reduce((n, v) => n + v.length, 0),
    senzaEsito,
  };
}
