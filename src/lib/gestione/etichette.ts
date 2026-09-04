/**
 * Le parole del gestionale, in italiano.
 *
 * Il database parla inglese per convenzione; il banco no. Le
 * corrispondenze stanno qui, in un posto solo, così un'etichetta
 * cambiata cambia dappertutto.
 */

export const DISCIPLINE: Record<string, string> = {
  physician: "Medico",
  nutritionist: "Nutrizionista",
  osteopath: "Osteopata",
  psychologist: "Psicologo",
  trainer: "Trainer",
  nurse: "Infermiere",
  other: "Altro",
};

export const CANALI_INCASSO: Record<string, string> = {
  cash: "Contanti",
  pos: "POS",
  bank_transfer: "Bonifico",
  online: "Online",
  other: "Altro",
};

export const TIPI_INCASSO: Record<string, string> = {
  service: "Prestazione",
  membership: "Membership",
  membership_renewal: "Rinnovo membership",
  package: "Pacchetto",
  upgrade: "Upgrade",
  extra: "Extra",
};

export const STATI_VISITA: Record<string, { label: string; tono: "neutro" | "buono" | "avviso" | "spento" }> = {
  scheduled: { label: "Da confermare", tono: "avviso" },
  confirmed: { label: "Confermata", tono: "neutro" },
  completed: { label: "Svolta", tono: "buono" },
  no_show: { label: "Non presentato", tono: "avviso" },
  cancelled: { label: "Disdetta", tono: "spento" },
};

export const STATI_MEMBERSHIP: Record<string, string> = {
  active: "Attiva",
  paused: "Sospesa",
  cancelled: "Chiusa",
  expired: "Scaduta",
  pending: "In attesa",
};

/** Lunedì per primo, come sul calendario di una clinica; la domenica chiude. */
export const GIORNI_SETTIMANA: { weekday: number; chiave: string; label: string }[] = [
  { weekday: 1, chiave: "lun", label: "Lunedì" },
  { weekday: 2, chiave: "mar", label: "Martedì" },
  { weekday: 3, chiave: "mer", label: "Mercoledì" },
  { weekday: 4, chiave: "gio", label: "Giovedì" },
  { weekday: 5, chiave: "ven", label: "Venerdì" },
  { weekday: 6, chiave: "sab", label: "Sabato" },
  { weekday: 0, chiave: "dom", label: "Domenica" },
];

export function etichetta(mappa: Record<string, string>, chiave: string | null | undefined): string {
  if (!chiave) return "—";
  return mappa[chiave] ?? chiave;
}
