import type { AppNotification } from "@/lib/domain/types";
import type { Discipline } from "@/lib/professionals/disciplines";
import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAttenzione } from "@/lib/data/attenzione";
import {
  contaPerCategoria,
  pazientiDaGuardare,
  type ContoAttenzione,
  type PazienteDaGuardare,
  type SegnaleAttenzione,
} from "@/lib/clinical/attenzione";
import type { AppuntamentoBreve } from "@/lib/data/professional";

/**
 * La schermata di apertura dell'area clinica.
 *
 * Una struttura sola, così la pagina resta un unico `await` — la stessa
 * scelta della home del paziente, e per la stessa ragione: una pagina
 * che fa sei letture in sequenza mostra sei momenti diversi della
 * giornata, e nessuno di essi è adesso.
 *
 * I numeri della striscia **non hanno query proprie**. Sono conteggi sui
 * segnali che il centro di attenzione ha già prodotto, e questo non è
 * un risparmio: è l'unico modo perché la striscia e la coda sotto non
 * possano contraddirsi. Un contatore che dice «3 referti da revisionare»
 * sopra un elenco che ne mostra due è il genere di incoerenza che
 * distrugge la fiducia in un cruscotto, e nasce sempre così — da due
 * query che contano la stessa cosa con due `where` leggermente diversi.
 */

export interface NumeriGiornata {
  pazientiOggi: number;
  visiteOggi: number;
  /** Visite già svolte di cui manca l'esito. */
  daCompletare: number;
  refertiDaRevisionare: number;
  risultatiNuovi: number;
  criticita: number;
  taskAperti: number;
  messaggi: number;
  reassessment: number;
  followUp: number;
  anomalie: number;
}

export interface ComandoClinico {
  discipline: Discipline;
  /** Vero se chi guarda ha titolo per approvare un dato clinico. */
  puoApprovare: boolean;
  oggi: AppuntamentoBreve[];
  prossimi: AppuntamentoBreve[];
  notifiche: AppNotification[];
  segnali: SegnaleAttenzione[];
  conti: ContoAttenzione[];
  pazienti: PazienteDaGuardare[];
  messiATacere: number;
  numeri: NumeriGiornata;
}

const ROMA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dataRomana(iso: string | Date): string {
  return ROMA.format(typeof iso === "string" ? new Date(iso) : iso);
}

interface RigaAppuntamento {
  id: string;
  service_name: string;
  starts_at: string;
  location: string | null;
  status: string;
  patient: { id: string; profile: { full_name: string } | null } | null;
}

export async function getComandoClinico(): Promise<ComandoClinico | null> {
  if (!isSupabaseConfigured()) return null;

  const profile = await getCurrentProfile();
  if (!profile || profile.role === "patient") return null;

  const supabase = await createSupabaseServerClient();

  const adesso = new Date();
  const daIeri = new Date(adesso.getTime() - 36 * 3600 * 1000).toISOString();
  const aOttoGiorni = new Date(adesso.getTime() + 8 * 24 * 3600 * 1000).toISOString();

  const [attenzione, proRes, apptRes, notifRes] = await Promise.all([
    getAttenzione(),

    supabase
      .from("professionals")
      .select("id, discipline")
      .eq("profile_id", profile.id)
      .maybeSingle(),

    supabase
      .from("appointments")
      .select(
        "id, service_name, starts_at, location, status, patient:patients(id, profile:profiles(full_name))",
      )
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", daIeri)
      .lte("starts_at", aOttoGiorni)
      .order("starts_at", { ascending: true })
      .limit(40),

    supabase
      .from("notifications")
      .select("id, title, body, link_url, read_at, created_at")
      .eq("profile_id", profile.id)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const discipline =
    (proRes.data as { discipline: Discipline } | null)?.discipline ?? "other";

  const appuntamenti: AppuntamentoBreve[] = (
    (apptRes.data ?? []) as unknown as RigaAppuntamento[]
  ).map((r) => ({
    id: r.id,
    patientId: r.patient?.id ?? "",
    patientName: r.patient?.profile?.full_name ?? "Paziente",
    serviceName: r.service_name,
    startsAt: r.starts_at,
    location: r.location,
    status: r.status,
  }));

  const giornoRoma = dataRomana(adesso);
  const oggi = appuntamenti.filter((a) => dataRomana(a.startsAt) === giornoRoma);
  const prossimi = appuntamenti
    .filter((a) => dataRomana(a.startsAt) > giornoRoma)
    .slice(0, 6);

  const { segnali, messiATacere } = attenzione;
  const conti = contaPerCategoria(segnali);
  const conta = (categoria: string) =>
    conti.find((c) => c.categoria === categoria)?.totale ?? 0;

  /*
   * «Visite da completare» conta i segnali, non le righe dell'agenda.
   *
   * Un appuntamento passato in stato `confirmed` non è per forza da
   * completare: potrebbe essere di stamattina, e stamattina non è
   * ancora finita. La distinzione la fa già la regola nel motore, e
   * ricalcolarla qui significherebbe tenerne allineate due.
   */
  const daCompletare = segnali.filter(
    (s) => s.categoria === "visita" && s.id.startsWith("visita:"),
  ).length;

  const numeri: NumeriGiornata = {
    pazientiOggi: new Set(oggi.map((a) => a.patientId)).size,
    visiteOggi: oggi.length,
    daCompletare,
    refertiDaRevisionare: conta("documento"),
    risultatiNuovi: conta("risultato"),
    criticita: conta("criticita"),
    taskAperti: conta("task"),
    messaggi: conta("messaggio"),
    reassessment: conta("reassessment"),
    followUp: conta("follow_up"),
    anomalie: conta("anomalia"),
  };

  return {
    discipline,
    // La stessa regola che il database impone con
    // `can_approve_clinical_flag()`. Qui serve solo a non mostrare un
    // pulsante che Postgres rifiuterebbe.
    puoApprovare:
      profile.role === "admin" || profile.role === "owner" || discipline === "physician",
    oggi,
    prossimi,
    notifiche: ((notifRes.data ?? []) as {
      id: string;
      title: string;
      body: string | null;
      link_url: string | null;
      read_at: string | null;
      created_at: string;
    }[]).map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      linkUrl: r.link_url,
      readAt: r.read_at,
      createdAt: r.created_at,
    })),
    segnali,
    conti,
    pazienti: pazientiDaGuardare(segnali),
    messiATacere,
    numeri,
  };
}
