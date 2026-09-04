"use client";

import { usePathname } from "next/navigation";
import { SezioniWorkspace } from "@/components/clinical/command-center";

/**
 * Le sezioni della cartella, con quella corrente accesa.
 *
 * Client soltanto per `usePathname`: le voci restano `<Link>`, quindi
 * ogni sezione conserva il proprio indirizzo. Sapere quale è attiva è
 * l'unica cosa che il server non può dire, perché il layout non viene
 * rieseguito navigando fra due sezioni annidate — è il motivo per cui
 * esiste, e sarebbe uno spreco perderlo per un'evidenziazione.
 *
 * L'ordine non è alfabetico e non è casuale: segue come si legge una
 * cartella. Prima cosa c'è (panoramica), poi cosa dicono i dati
 * (clinico, score), poi da dove vengono (documenti), poi cosa si è
 * deciso (piano, percorso), poi cosa si fa adesso (visita), infine cosa
 * ci si è detti e cosa è successo (comunicazioni, timeline).
 */

interface Conte {
  documenti: number;
  revisioni: number;
}

export function SezioniCartella({
  patientId,
  conte,
}: {
  patientId: string;
  conte: Conte;
}) {
  const percorso = usePathname();
  const base = `/pro/pazienti/${patientId}`;

  const voci = [
    { href: base, label: "Panoramica" },
    { href: `${base}/clinico`, label: "Clinico" },
    { href: `${base}/score`, label: "Longevity Score" },
    { href: `${base}/documenti`, label: "Documenti", conta: conte.documenti },
    { href: `${base}/piano`, label: "Piano" },
    { href: `${base}/percorso`, label: "Percorso" },
    { href: `${base}/visita`, label: "Visita" },
    { href: `${base}/comunicazioni`, label: "Comunicazioni" },
    { href: `${base}/timeline`, label: "Timeline" },
  ];

  // Il percorso può portare una barra finale o un segmento più profondo:
  // la sezione attiva è la voce più lunga di cui il percorso è un
  // prefisso, e la panoramica solo se combaciano esattamente.
  const attiva =
    voci
      .filter((v) => v.href !== base && percorso.startsWith(v.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? base;

  return <SezioniWorkspace voci={voci} attiva={attiva} />;
}
