"use client";

import Link from "next/link";
import { Marchio } from "@/components/brand/marchio";
import { ANCORE, useRegia } from "@/components/landing/regia";

/**
 * La chiusura.
 *
 * Corta di proposito. Un piè di pagina lungo serve a un sito con
 * cinquanta pagine; qui ce n'è una, e le sole destinazioni che esistono
 * davvero sono le sue sezioni e la porta d'accesso.
 *
 * **Nessun collegamento inventato.** Privacy, termini e note legali sono
 * pagine che questo progetto non ha ancora: metterle qui come link morti
 * su un prodotto che tratta dati sanitari sarebbe la promessa peggiore
 * che questa pagina potrebbe fare. Quando esisteranno, il loro posto è
 * questo.
 */

export function UniqueFooter({ anno }: { anno: number }) {
  const { vai } = useRegia();

  return (
    <footer className="relative border-t" style={{ borderColor: "var(--os-riga)" }}>
      <div className="os-gabbia py-14 sm:py-16">
        <div className="flex flex-col gap-12 lg:flex-row lg:justify-between">
          {/* ── Il marchio ────────────────────────────────────── */}
          <div className="max-w-[380px]">
            <div className="flex items-baseline gap-2.5">
              <Marchio className="h-7 w-auto self-center" />
              <span className="text-[15px] font-medium text-[color:var(--os-piena)]">
                Unique
              </span>
              <span className="os-mono text-[color:var(--os-tenue)]">OS</span>
            </div>

            <p className="os-corpo mt-5 text-[14.5px]">
              Il sistema operativo digitale di Unique Longevity Clinic: la persona,
              i suoi dati, il team clinico e l&rsquo;intelligenza che li tiene
              insieme.
            </p>

            <p className="os-mono mt-6 text-[color:var(--os-appena)]">
              Longevity. Personalized. For life.
            </p>
          </div>

          {/* ── Le destinazioni ───────────────────────────────── */}
          <div className="flex flex-wrap gap-12 sm:gap-16">
            <nav aria-label="Sezioni">
              <p className="os-mono text-[color:var(--os-appena)]">Il sistema</p>
              <ul className="mt-5 space-y-3">
                {ANCORE.map(({ id, etichetta }) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        vai(`#${id}`);
                      }}
                      className="os-voce text-[14px]"
                    >
                      {etichetta}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="Accesso">
              <p className="os-mono text-[color:var(--os-appena)]">Accesso</p>
              <ul className="mt-5 space-y-3">
                <li>
                  <Link href="/accedi" className="os-voce text-[14px]">
                    Accedi
                  </Link>
                </li>
                <li>
                  <Link href="/accedi?modo=attiva" className="os-voce text-[14px]">
                    Attiva il tuo accesso
                  </Link>
                </li>
                <li>
                  <Link href="/accedi?modo=password" className="os-voce text-[14px]">
                    Password dimenticata
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <hr className="os-filo my-11" />

        <div className="flex flex-col-reverse gap-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="os-mono text-[color:var(--os-appena)]">
            © {anno} Unique Longevity Clinic
          </p>

          <p className="os-mono flex items-center gap-2.5 text-[color:var(--os-appena)]">
            <span className="os-vivo" aria-hidden="true" />
            Dati sanitari · infrastruttura nell&rsquo;Unione Europea
          </p>
        </div>
      </div>
    </footer>
  );
}
