import type { PatientDashboardData } from "@/lib/domain/types";
import { computeJourneyStage, type JourneyResult } from "@/lib/journey/stages";
import { prossimiPassi, type ProssimiPassi, type StatoPaziente } from "@/lib/patient/prossimo-passo";
import type { ContestoPaziente } from "@/lib/patient/assistente";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  consensiMancanti,
  conversazioni,
  profilo,
  questionari,
  type QuestionarioInElenco,
} from "@/lib/data/paziente-sezioni";

/**
 * Dove si trova il paziente e cosa gli conviene fare adesso.
 *
 * Questo file non decide niente: raccoglie i fatti e li passa a due
 * motori puri — `computeJourneyStage`, che è lo stesso che usa il CRM
 * della direzione, e `prossimiPassi`, che parla al paziente. Che la fase
 * del percorso sia calcolata dalla stessa funzione da entrambe le parti
 * non è un'ottimizzazione: è la ragione per cui il paziente e la clinica
 * vedono lo stesso percorso.
 */

function giorniDa(iso: string | null, oggi: string): number | null {
  if (!iso) return null;
  const x = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const y = Date.parse(`${oggi.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return Math.round((y - x) / 86_400_000);
}

function giorniA(iso: string | null, oggi: string): number | null {
  const g = giorniDa(iso, oggi);
  return g === null ? null : -g;
}

export interface SituazionePaziente {
  fase: JourneyResult;
  passi: ProssimiPassi;
  questionari: QuestionarioInElenco[];
  questionariDaFare: QuestionarioInElenco[];
  messaggiNonLetti: number;
  /** Il contesto che l'assistente può usare. Niente di più. */
  contestoAssistente: ContestoPaziente;
}

export async function situazione(dati: PatientDashboardData): Promise<SituazionePaziente> {
  const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());

  const [elencoQuestionari, fili, ilProfilo, pagamentiFalliti] = await Promise.all([
    questionari(),
    conversazioni(),
    profilo(),
    contaPagamentiFalliti(),
  ]);

  const daFare = elencoQuestionari.filter((q) => q.stato !== "completed");
  const messaggiNonLetti = fili.reduce((somma, f) => somma + f.nonLetti, 0);
  const documentiNonLetti = dati.newDocuments.filter((d) => d.isNewForPatient).length;

  const fase = computeJourneyStage({
    leadLost: false,
    hasBookedFirstVisit: dati.nextAppointment !== null || dati.scoreHistory.length > 0,
    hasScore: dati.score !== null,
    lastScoreOn: dati.score?.measuredOn ?? null,
    hasPlan: dati.enrollment !== null || dati.actions.length > 0,
    membershipProposedAt: null,
    membershipActive: dati.membership.status === "active",
    membershipEnded: dati.membership.status === "expired" || dati.membership.status === "cancelled",
    programActive: dati.enrollment?.status === "active",
    lastActivityOn: dati.score?.measuredOn ?? dati.nextAppointment?.startsAt ?? null,
    today: oggi,
  });

  const stato: StatoPaziente = {
    oggi,
    fase: fase.stage,
    giorniDaScore: giorniDa(dati.score?.measuredOn ?? null, oggi),
    pilastriIncompleti: dati.score
      ? dati.score.pillars.filter((p) => p.value === null).map((p) => p.label)
      : [],
    prossimaVisitaIso: dati.nextAppointment?.startsAt ?? null,
    visiteInProgramma: dati.nextAppointment ? 1 : 0,
    questionariDaFare: daFare.map((q) => ({ id: q.id, titolo: q.titolo, scadeIl: q.scadeIl })),
    documentiNonLetti,
    messaggiNonLetti,
    azioniDelPiano: dati.actions
      .filter((a) => a.status !== "done" && a.status !== "dismissed")
      .map((a) => ({ id: a.id, titolo: a.title, scadeIl: a.dueOn })),
    creditiDisponibili: dati.membership.credits.available,
    giorniAllaScadenzaMembership: giorniA(dati.membership.endsOn, oggi),
    pagamentiFalliti,
    consensiMancanti: ilProfilo ? consensiMancanti(ilProfilo.consensi) : [],
  };

  const contestoAssistente: ContestoPaziente = {
    nome: dati.profile.firstName ?? dati.profile.fullName.split(" ")[0] ?? "",
    oggi,
    score: dati.score?.score ?? null,
    scorePrecedente: dati.score?.previousScore ?? null,
    scoreMisuratoIl: dati.score?.measuredOn ?? null,
    pilastri: (dati.score?.pillars ?? []).map((p) => ({
      etichetta: p.label,
      valore: p.value,
      delta: p.delta,
    })),
    prossimaVisita: dati.nextAppointment
      ? {
          servizio: dati.nextAppointment.serviceName,
          quando: dati.nextAppointment.startsAt,
          professionista: dati.nextAppointment.professional
            ? [dati.nextAppointment.professional.title, dati.nextAppointment.professional.fullName]
                .filter(Boolean)
                .join(" ")
            : null,
          luogo: dati.nextAppointment.location,
        }
      : null,
    visiteInProgramma: stato.visiteInProgramma,
    creditiDisponibili: dati.membership.credits.available,
    creditiPrenotati: dati.membership.credits.reserved,
    membershipPiano: dati.membership.planName,
    membershipScadeIl: dati.membership.endsOn,
    azioniAperte: stato.azioniDelPiano.map((a) => ({ titolo: a.titolo, scadeIl: a.scadeIl })),
    questionariDaFare: daFare.map((q) => ({ titolo: q.titolo })),
    documentiNuovi: documentiNonLetti,
    messaggiNonLetti,
    progressi: dati.highlights.map((h) => ({
      etichetta: h.label,
      valore: h.value,
      variazione: h.change,
      miglioramento: h.isImprovement,
    })),
  };

  return {
    fase,
    passi: prossimiPassi(stato),
    questionari: elencoQuestionari,
    questionariDaFare: daFare,
    messaggiNonLetti,
    contestoAssistente,
  };
}

/** I pagamenti non andati a buon fine e non ancora recuperati. */
async function contaPagamentiFalliti(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed");

  return count ?? 0;
}
