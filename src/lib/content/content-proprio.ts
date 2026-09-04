import "server-only";
import { requireProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cercaConoscenza, conoscenzaPerSlug } from "@/lib/knowledge/queries";
import { contenutiMigliori } from "@/lib/data/marketing";
import {
  costruisciImpalcatura,
  massimoCaratteri,
  type FattoConoscenza,
  type FormatoImpalcatura,
  type Impalcatura,
} from "@/lib/content/impalcatura";
import { controllaContenuto, type Segnalazione } from "@/lib/content/regole-brand";

/**
 * Il Content Brain senza modello.
 *
 * Fa due cose, e la seconda vale più della prima.
 *
 * **Costruisce l'impalcatura**: struttura del formato, fatti citati dalla
 * knowledge base in vigore, angoli e ganci che hanno funzionato davvero,
 * vincoli di brand applicati, e — riga per riga — cosa manca. È una
 * traccia con dentro le cose vere, non un post finito: le parole belle le
 * trova un modello, e non c'è motivo di fingere il contrario.
 *
 * **Controlla la conformità**: e qui il codice batte il modello. Un
 * controllo a regole verifica ogni volta, dà sempre la stessa risposta
 * sullo stesso testo, e non si stanca alla ventesima variante. Vale per
 * ciò che scrive una persona come per ciò che scrive un modello — ed è
 * l'uso più utile di tutti, perché è l'unico che protegge da un claim di
 * guarigione pubblicato per distrazione.
 */

/** I prezzi che un contenuto può nominare: quelli del listino in vigore. */
async function prezziAmmessi(): Promise<number[]> {
  const [listino] = await conoscenzaPerSlug(["listino-servizi"]);
  const prezzi = (listino?.data.prezzi_cents ?? {}) as Record<string, number>;
  return Object.values(prezzi).filter((v) => Number.isFinite(v));
}

async function raccogliFatti(brief: string): Promise<FattoConoscenza[]> {
  const [base, pertinenti] = await Promise.all([
    conoscenzaPerSlug([
      "brand-identita",
      "brand-sistema-visivo",
      "marketing-linee-guida",
      "listino-servizi",
    ]),
    cercaConoscenza(brief, 5),
  ]);

  const gia = new Set(base.map((v) => v.slug));
  const tutte = [...base, ...pertinenti.filter((v) => !gia.has(v.slug))];

  return tutte.map((v) => ({
    slug: v.slug,
    titolo: v.title,
    tipo: v.kind,
    corpo: v.body,
    provenienza: v.provenienza,
    daRiconfermare: v.daRiconfermare,
    dati: v.data,
  }));
}

export interface EsitoContenutoProprio {
  id: string;
  impalcatura: Impalcatura;
  /** Il controllo di conformità sull'impalcatura stessa. */
  segnalazioni: Segnalazione[];
  createdAt: string;
}

export async function costruisciContenutoProprio(input: {
  formato: FormatoImpalcatura;
  brief: string;
  campaignId?: string | null;
}): Promise<EsitoContenutoProprio> {
  const profile = await requireProfile();
  if (!["admin", "owner", "marketing"].includes(profile.role)) {
    throw new Error("Il Content Brain è riservato a direzione e marketing.");
  }

  const brief = input.brief.trim();
  if (brief.length < 8) throw new Error("Il brief è troppo corto per costruire qualcosa.");

  const [fatti, migliori, prezzi] = await Promise.all([
    raccogliFatti(brief),
    contenutiMigliori(5),
    prezziAmmessi(),
  ]);

  const angoli = new Map<string, number>();
  for (const contenuto of migliori) {
    if (contenuto.angle) angoli.set(contenuto.angle, (angoli.get(contenuto.angle) ?? 0) + 1);
  }

  const impalcatura = costruisciImpalcatura({
    formato: input.formato,
    brief,
    fatti,
    angoli: [...angoli.entries()]
      .map(([angolo, volte]) => ({ angolo, volte }))
      .sort((a, b) => b.volte - a.volte),
    ganci: migliori
      .filter((c) => c.hook)
      .map((c) => ({ testo: c.hook as string, formato: c.format, lead: c.leadsAttributed })),
  });

  // Il controllo si passa anche a se stessi: se un fatto citato dalla
  // knowledge base violasse una regola di brand, è la knowledge base a
  // dover cambiare — ed è meglio scoprirlo qui.
  const testoCompleto = [
    ...impalcatura.blocchi.map((b) => b.testo ?? ""),
    impalcatura.callToAction,
  ]
    .filter(Boolean)
    .join("\n\n");

  const segnalazioni = controllaContenuto(testoCompleto, {
    prezziAmmessiCents: prezzi,
    massimoCaratteri: massimoCaratteri(input.formato),
  });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("generated_contents")
    .insert({
      kind: input.formato,
      brief,
      title: impalcatura.titolo,
      // Stessa forma di quella del modello: la pagina non deve sapere
      // chi ha prodotto cosa, e i due percorsi restano intercambiabili.
      output: {
        titolo: impalcatura.titolo,
        blocchi: impalcatura.blocchi,
        call_to_action: impalcatura.callToAction,
        hook_alternativi: impalcatura.ganciSuggeriti,
        vincoli_rispettati: impalcatura.vincoli,
        fonti: impalcatura.fonti,
        da_far_rileggere: impalcatura.avvertenze,
        segnalazioni,
      },
      sources: impalcatura.fonti.map((f) => ({ slug: f.slug, usata_per: f.usata_per })),
      model: "content-unique",
      created_by: profile.id,
      campaign_id: input.campaignId ?? null,
    })
    .select("id, created_at")
    .single();

  if (error) throw new Error(`Impalcatura non salvata: ${error.message}`);
  const row = data as { id: string; created_at: string };

  return {
    id: row.id,
    impalcatura,
    segnalazioni,
    createdAt: row.created_at,
  };
}

export interface EsitoControllo {
  segnalazioni: Segnalazione[];
  pubblicabile: boolean;
  caratteri: number;
}

/**
 * Il controllo su un testo qualunque.
 *
 * Serve al testo scritto da una persona quanto a quello scritto da un
 * modello — e nel secondo caso serve di più, perché un modello che ha
 * ricevuto l'istruzione di non promettere guarigioni la rispetta quasi
 * sempre, e "quasi" è la parola su cui si costruiscono i guai.
 */
export async function controllaTesto(
  testo: string,
  formato?: FormatoImpalcatura,
): Promise<EsitoControllo> {
  const profile = await requireProfile();
  if (!["admin", "owner", "marketing"].includes(profile.role)) {
    throw new Error("Il controllo dei contenuti è riservato a direzione e marketing.");
  }

  const prezzi = await prezziAmmessi();
  const segnalazioni = controllaContenuto(testo, {
    prezziAmmessiCents: prezzi.length > 0 ? prezzi : undefined,
    massimoCaratteri: formato ? massimoCaratteri(formato) : undefined,
  });

  return {
    segnalazioni,
    pubblicabile: !segnalazioni.some((s) => s.gravita === "blocco"),
    caratteri: testo.length,
  };
}
