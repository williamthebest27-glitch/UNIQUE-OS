"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

type LinkProps = ComponentProps<typeof Link>;

/**
 * La voce di un menu.
 *
 * Identica a un `<Link>`, tranne per una cosa: al passaggio del mouse
 * Next va a prendere la sezione *con i suoi dati*, non solo lo
 * scheletro. Fra il momento in cui il puntatore arriva sulla voce e
 * quello in cui il dito preme passano due o trecento millisecondi —
 * quanto basta perché al clic non resti niente da aspettare.
 *
 * Senza questo, un percorso dinamico viene prefetchato fino al primo
 * confine di caricamento e non oltre: lo scheletro compare subito, ma i
 * numeri partono da zero nell’istante del clic. È esattamente ciò che si
 * vede come "la sezione si apre e i dati arrivano dopo".
 *
 * Il runtime di Next 16 conosce questa proprietà — la legge in
 * `client/app-dir/link.js`, insieme al flag `dynamicOnHover` di
 * `next.config.ts` — ma i tipi pubblici di `next/link` non la espongono
 * ancora. Il cast sta qui, in un punto solo: se un domani cambia nome,
 * si corregge una riga.
 */
const PREFETCH_AL_PASSAGGIO = {
  unstable_dynamicOnHover: true,
} as unknown as Partial<LinkProps>;

export function NavLink(props: LinkProps) {
  return <Link {...props} {...PREFETCH_AL_PASSAGGIO} />;
}
