/**
 * L'esito di un'azione del gestionale, per chi sta al banco.
 *
 * Una frase sola, in italiano, o niente. Il modulo la mostra sotto il
 * bottone e la reception la legge al paziente — quindi niente codici,
 * niente "errore 23505", niente inglese.
 */
export type EsitoGestione = {
  esito: "ok" | "errore";
  messaggio: string;
} | null;

/** Un errore di Postgres arriva con prefissi che non dicono niente. Il testo che scriviamo nelle funzioni sì. */
export function messaggioLeggibile(raw: string): string {
  return raw.replace(/^.*?(?:ERROR|error):\s*/i, "").trim() || "Operazione non riuscita.";
}
