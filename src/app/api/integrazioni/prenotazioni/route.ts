import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  createSupabaseServiceClient,
  isServiceRoleConfigured,
} from "@/lib/supabase/service";

/**
 * Ingresso dal gestionale della clinica.
 *
 * Unique OS non deve sostituire subito il sistema di prenotazione: deve
 * saperne leggere disponibilità e appuntamenti. Questo endpoint accetta
 * l'uno e gli altri, riconciliandoli per `external_ref` — l'identificativo
 * del sistema d'origine, che resta la fonte di verità per quelle righe.
 *
 * Un appuntamento che entra da qui fa scattare il credit engine come
 * quelli creati in Unique OS: il credito passa da disponibile a prenotato.
 * È il motivo per cui l'integrazione vale la pena — i due sistemi devono
 * raccontare la stessa storia sui crediti.
 */

export const dynamic = "force-dynamic";

const Appuntamento = z.object({
  external_ref: z.string().min(1),
  patient_code: z.string().min(1),
  professional_license: z.string().nullish(),
  service_slug: z.string().nullish(),
  service_name: z.string().nullish(),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]),
  attendance: z.enum(["pending", "attended", "no_show"]).nullish(),
  location: z.string().nullish(),
  credits_cost: z.number().nullish(),
});

const Slot = z.object({
  external_ref: z.string().min(1),
  professional_license: z.string().min(1),
  service_slug: z.string().nullish(),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  is_booked: z.boolean().default(false),
});

const Payload = z.object({
  appointments: z.array(Appuntamento).max(500).default([]),
  slots: z.array(Slot).max(500).default([]),
});

/** Confronto a tempo costante: un confronto normale perde il segreto. */
function tokenValido(fornito: string | null): boolean {
  const atteso = process.env.UNIQUE_SYNC_TOKEN ?? "";
  if (atteso.length === 0 || !fornito) return false;

  const a = Buffer.from(fornito);
  const b = Buffer.from(atteso);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!tokenValido(request.headers.get("x-unique-sync-token"))) {
    return NextResponse.json({ errore: "Token non valido." }, { status: 401 });
  }

  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      { errore: "SUPABASE_SERVICE_ROLE_KEY non impostata." },
      { status: 503 },
    );
  }

  let payload: z.infer<typeof Payload>;
  try {
    payload = Payload.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { errore: "Payload non valido.", dettaglio: String(error) },
      { status: 400 },
    );
  }

  // Il gestionale è un sistema, non un utente: qui non c'è una sessione da
  // cui derivare i permessi. L'autorizzazione è il token, verificato sopra.
  const supabase = createSupabaseServiceClient();

  const scartati: { external_ref: string; motivo: string }[] = [];
  let appuntamentiScritti = 0;
  let slotScritti = 0;

  // ── Anagrafiche di riferimento, risolte una volta sola ──────────
  const [{ data: pazienti }, { data: professionisti }, { data: servizi }] =
    await Promise.all([
      supabase.from("patients").select("id, patient_code").not("patient_code", "is", null),
      supabase.from("professionals").select("id, license_no").not("license_no", "is", null),
      supabase.from("services").select("id, slug, name, credits_cost"),
    ]);

  const perCodice = new Map(
    ((pazienti ?? []) as { id: string; patient_code: string }[]).map((p) => [
      p.patient_code,
      p.id,
    ]),
  );
  const perLicenza = new Map(
    ((professionisti ?? []) as { id: string; license_no: string }[]).map((p) => [
      p.license_no,
      p.id,
    ]),
  );
  const perSlug = new Map(
    ((servizi ?? []) as {
      id: string;
      slug: string;
      name: string;
      credits_cost: number;
    }[]).map((s) => [s.slug, s]),
  );

  // ── Appuntamenti ────────────────────────────────────────────────
  for (const appt of payload.appointments) {
    const patientId = perCodice.get(appt.patient_code);
    if (!patientId) {
      scartati.push({
        external_ref: appt.external_ref,
        motivo: `Nessun paziente con codice ${appt.patient_code}.`,
      });
      continue;
    }

    const servizio = appt.service_slug ? perSlug.get(appt.service_slug) : undefined;
    const nome = appt.service_name ?? servizio?.name;
    if (!nome) {
      scartati.push({
        external_ref: appt.external_ref,
        motivo: "Servizio non riconosciuto e nessun nome fornito.",
      });
      continue;
    }

    const { error } = await supabase.from("appointments").upsert(
      {
        external_ref: appt.external_ref,
        source: "gestionale",
        patient_id: patientId,
        professional_id: appt.professional_license
          ? (perLicenza.get(appt.professional_license) ?? null)
          : null,
        service_id: servizio?.id ?? null,
        service_name: nome,
        status: appt.status,
        attendance: appt.attendance ?? "pending",
        starts_at: appt.starts_at,
        ends_at: appt.ends_at,
        location: appt.location ?? null,
        credits_cost: appt.credits_cost ?? servizio?.credits_cost ?? 0,
      },
      { onConflict: "external_ref" },
    );

    if (error) {
      scartati.push({ external_ref: appt.external_ref, motivo: error.message });
      continue;
    }
    appuntamentiScritti += 1;
  }

  // ── Disponibilità ───────────────────────────────────────────────
  for (const slot of payload.slots) {
    const professionalId = perLicenza.get(slot.professional_license);
    if (!professionalId) {
      scartati.push({
        external_ref: slot.external_ref,
        motivo: `Nessun professionista con licenza ${slot.professional_license}.`,
      });
      continue;
    }

    const { error } = await supabase.from("availability_slots").upsert(
      {
        external_ref: slot.external_ref,
        source: "gestionale",
        professional_id: professionalId,
        service_id: slot.service_slug
          ? (perSlug.get(slot.service_slug)?.id ?? null)
          : null,
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
        is_booked: slot.is_booked,
      },
      { onConflict: "external_ref" },
    );

    if (error) {
      scartati.push({ external_ref: slot.external_ref, motivo: error.message });
      continue;
    }
    slotScritti += 1;
  }

  return NextResponse.json({
    appuntamenti: appuntamentiScritti,
    disponibilita: slotScritti,
    scartati,
  });
}
