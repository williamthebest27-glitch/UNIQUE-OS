import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Firma e ritmo dei webhook.
 *
 * Sta in un file suo, senza `server-only` e senza Supabase, per una
 * ragione pratica: la firma è la parte che deve essere verificabile con
 * un test, e chi riceve i nostri eventi deve poter leggere qui come si
 * ricostruisce — è la stessa funzione che gli serve dall'altra parte.
 */

/** Attesa prima del prossimo tentativo: 1, 2, 4, 8, 16, 32 minuti. */
export function backoffMinuti(tentativi: number): number {
  return Math.min(2 ** Math.max(0, tentativi - 1), 32);
}

/**
 * Firma del corpo, HMAC SHA-256.
 *
 * Il timestamp è dentro la firma, non accanto: senza, una richiesta
 * valida catturata oggi resterebbe valida per sempre.
 */
export function firmaPayload(secret: string, timestamp: string, body: string): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

/** Verifica di una firma ricevuta, a tempo costante. */
export function verificaFirma(
  secret: string,
  header: string,
  body: string,
  tolleranzaSecondi = 300,
  adesso = Date.now(),
): boolean {
  const parti = new Map(
    header.split(",").map((p) => {
      const [k, ...v] = p.split("=");
      return [k.trim(), v.join("=")] as const;
    }),
  );

  const t = parti.get("t");
  const v1 = parti.get("v1");
  if (!t || !v1) return false;

  const eta = Math.abs(adesso - Number(t) * 1000) / 1000;
  if (!Number.isFinite(eta) || eta > tolleranzaSecondi) return false;

  const atteso = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const a = Buffer.from(v1);
  const b = Buffer.from(atteso);
  return a.length === b.length && timingSafeEqual(a, b);
}
