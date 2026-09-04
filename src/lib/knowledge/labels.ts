import type { KnowledgeKind } from "@/lib/knowledge/validity";

/** Come si chiamano i tipi di informazione in italiano, in interfaccia. */
export const TIPI_CONOSCENZA: Record<KnowledgeKind, string> = {
  procedura: "Procedure",
  listino: "Listini",
  servizio: "Servizi",
  faq: "FAQ",
  professionista: "Professionisti",
  protocollo: "Protocolli",
  brand: "Brand",
  marketing: "Marketing",
  script: "Script",
  policy: "Policy",
  contratto: "Contratti",
  documentazione: "Documentazione",
};
