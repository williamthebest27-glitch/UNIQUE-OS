import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDayMonth } from "@/lib/format";
import {
  componiAiutoCartella,
  componiConfronto,
  componiMancanti,
  componiMigliorati,
  componiPeggiorati,
  componiSintesiCartella,
  componiValore,
  confrontaMisure,
  metricheMancanti,
  riconosciDomandaCartella,
  type MisuraStorica,
  type RispostaCartella,
} from "@/lib/clinical/cartella-domande";

/**
 * Il copilot clinico, senza modello.
 *
 * Raccoglie ciò che serve al confronto e lascia la risposta alle funzioni
 * pure. I dati arrivano dal client di sessione, quindi dalla Row Level
 * Security: **il copilot vede esattamente ciò che vede chi lo interroga**,
 * come prima. Un professionista non può ottenere per interposto motore
 * quello che non potrebbe leggere da sé.
 *
 * Legge solo le misure approvate. Ciò che è ancora in coda di revisione
 * non entra in una risposta: sarebbe un valore non validato presentato
 * come un fatto.
 */

export async function rispondiSullaCartella(
  patientId: string,
  domanda: string,
): Promise<RispostaCartella & { intento: string | null }> {
  const intento = riconosciDomandaCartella(domanda);

  if (!intento) {
    const aiuto = componiAiutoCartella();
    return {
      testo: `Non ho capito la domanda.\n\n${aiuto.testo}`,
      fonti: [],
      intento: null,
    };
  }

  if (intento.id === "aiuto") {
    return { ...componiAiutoCartella(), intento: intento.id };
  }

  const supabase = await createSupabaseServerClient();

  const { data: misureData } = await supabase
    .from("measurements")
    .select("metric_code, value, measured_on")
    .eq("patient_id", patientId)
    .not("value", "is", null)
    .order("measured_on", { ascending: false })
    .limit(400);

  const misure: MisuraStorica[] = (
    (misureData ?? []) as { metric_code: string; value: number; measured_on: string }[]
  ).map((m) => ({ code: m.metric_code, value: Number(m.value), measuredOn: m.measured_on }));

  if (misure.length === 0) {
    return {
      testo:
        "In cartella non ci sono misure approvate. Se sono stati caricati referti, i valori potrebbero essere ancora in coda di revisione: finché non li approva un professionista non entrano nelle risposte.",
      fonti: [],
      intento: intento.id,
    };
  }

  const variazioni = confrontaMisure(misure);

  switch (intento.id) {
    case "peggiorati":
      return { ...componiPeggiorati(variazioni), intento: intento.id };

    case "migliorati":
      return { ...componiMigliorati(variazioni), intento: intento.id };

    case "confronto":
      return { ...componiConfronto(variazioni), intento: intento.id };

    case "mancanti":
      return { ...componiMancanti(metricheMancanti(misure)), intento: intento.id };

    case "valore": {
      const variazione = variazioni.find((v) => v.code === intento.metrica);
      return {
        ...componiValore(variazione, intento.metrica ?? "quel parametro"),
        intento: intento.id,
      };
    }

    case "score":
    case "sintesi":
    default: {
      const [punteggioRes, visitaRes, documentiRes] = await Promise.all([
        supabase
          .from("longevity_scores")
          .select("score, previous_score, measured_on, coverage, score_pillars(label, value)")
          .eq("patient_id", patientId)
          .order("measured_on", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("appointments")
          .select("service_name, starts_at")
          .eq("patient_id", patientId)
          .eq("status", "completed")
          .order("starts_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("patient_id", patientId)
          .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
      ]);

      const punteggio = punteggioRes.data as {
        score: number;
        previous_score: number | null;
        measured_on: string;
        coverage: number | null;
        score_pillars: { label: string; value: number | null }[] | null;
      } | null;

      const visita = visitaRes.data as { service_name: string; starts_at: string } | null;

      const pilastriDeboli = (punteggio?.score_pillars ?? [])
        .filter((p): p is { label: string; value: number } => p.value !== null)
        .sort((a, b) => a.value - b.value)
        .slice(0, 2);

      return {
        ...componiSintesiCartella({
          score: punteggio?.score ?? null,
          scoreIl: punteggio?.measured_on ?? null,
          scorePrecedente: punteggio?.previous_score ?? null,
          copertura: punteggio?.coverage ?? null,
          pilastriDeboli: pilastriDeboli.map((p) => ({ label: p.label, valore: p.value })),
          variazioni,
          mancantiDiLaboratorio: metricheMancanti(misure, "lab").length,
          ultimaVisita: visita
            ? { servizio: visita.service_name, quando: formatDayMonth(visita.starts_at) }
            : null,
          documentiRecenti: documentiRes.count ?? 0,
        }),
        intento: intento.id,
      };
    }
  }
}
