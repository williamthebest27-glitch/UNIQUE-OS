/**
 * Gli importi come li scrive una persona italiana al banco.
 *
 * "149", "149,50", "1.200", "1.200,00", "€ 149" — tutte forme legittime
 * dello stesso gesto. Il database vuole centesimi interi; la conversione
 * sta qui, in un posto solo, con i suoi test.
 */
export function centesimiDa(testo: string): number | null {
  const pulito = testo.replace(/[€\s]/g, "").trim();
  if (!pulito) return null;

  // Con la virgola i punti sono migliaia. Senza virgola un punto seguito
  // da esattamente tre cifre è migliaia ("1.200"); altrimenti è decimale
  // ("149.5", chi viene da una tastiera inglese).
  let intero: string;
  let decimali: string;
  if (pulito.includes(",")) {
    const parti = pulito.split(",");
    if (parti.length > 2) return null;
    intero = parti[0].replace(/\./g, "");
    decimali = parti[1] ?? "";
  } else if (/^\d{1,3}(\.\d{3})+$/.test(pulito)) {
    intero = pulito.replace(/\./g, "");
    decimali = "";
  } else {
    const [i, d = ""] = pulito.split(".");
    intero = i;
    decimali = d;
  }

  if (!/^\d+$/.test(intero) || !/^\d{0,2}$/.test(decimali)) return null;

  return Number(intero) * 100 + Number((decimali + "00").slice(0, 2));
}

/** Da centesimi a "149,50", per precompilare un campo. */
export function euroDaCentesimi(cents: number): string {
  const segno = cents < 0 ? "-" : "";
  const assoluto = Math.abs(cents);
  return `${segno}${Math.floor(assoluto / 100)},${String(assoluto % 100).padStart(2, "0")}`;
}
