/**
 * Il marchio.
 *
 * Un'immagine, non un SVG disegnato a mano: la U è un degradé continuo
 * dal petrolio alla salvia con una foglia sfumata, e ridisegnarla a
 * curve avrebbe prodotto una somiglianza, non il logo. Il fondo bianco
 * dell'originale è stato convertito in trasparenza una volta per tutte
 * (canale alfa ricavato dalla distanza dal bianco, colore riportato al
 * valore pieno sui bordi), così lo stesso file sta sulla carta della
 * Patient App e sul nero del Control Center senza rettangoli chiari.
 *
 * Niente `next/image`: sono file piccoli, serviti statici, e il marchio
 * del sipario deve arrivare al primo fotogramma — non dopo un giro
 * dall'ottimizzatore.
 */

/** Il solo simbolo: la U con la foglia. */
export function Marchio({
  className,
  alt = "",
}: {
  className?: string;
  /** Vuoto quando accanto c'è già la parola "Unique": il lettore la sente due volte. */
  alt?: string;
}) {
  return (
    <img
      src="/marchio-unique.png"
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      width={441}
      height={494}
      decoding="async"
      className={className}
    />
  );
}

/** Il lockup intero: simbolo, nome, claim. Per le pagine che si presentano. */
export function Logotipo({
  className,
  alt = "Unique OS — Longevity. Personalized. For life.",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src="/logotipo-unique.png"
      alt={alt}
      width={974}
      height={831}
      decoding="async"
      className={className}
    />
  );
}
