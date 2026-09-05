import { Regia } from "@/components/landing/regia";
import { UniqueNavbar } from "@/components/landing/navbar";
import { HeroSystem } from "@/components/landing/hero";
import { SystemVisualization } from "@/components/landing/sistema";
import { DataIntelligence } from "@/components/landing/intelligenza";
import { IntelligenceEngine } from "@/components/landing/motore";
import { NextBestAction } from "@/components/landing/decisione";
import { LivingSystem } from "@/components/landing/organismo";
import { JourneyTimeline } from "@/components/landing/percorso";
import { PatientClinicConnection } from "@/components/landing/connessione";
import { ProductInterface } from "@/components/landing/interfaccia";
import { DnaFilm } from "@/components/landing/dna";
import { FinalCTA } from "@/components/landing/finale";
import { UniqueFooter } from "@/components/landing/footer";

/**
 * La landing di Unique OS.
 *
 * Non un elenco di sezioni: un percorso, e l'ordine è l'argomento.
 *
 *   accensione → cosa entra → lo stesso in otto secondi → cosa ne esce →
 *   come pensa → cosa decide →
 *   come evolve → cosa succede in novanta giorni → chi ci sta dentro →
 *   che cosa si usa davvero → la porta
 *
 * Le destinazioni arrivano da fuori, decise una volta sola in
 * `app/page.tsx` a partire dal routing e dalla sessione vere. Nessun
 * componente qui dentro sa dove porta un pulsante, e nessuno inventa un
 * indirizzo.
 */

export function UniqueLanding({
  entra,
  registrati,
  etichettaEntra,
  autenticato,
  anno,
}: {
  /** Dove porta il comando principale: il proprio livello, o l'accesso. */
  entra: string;
  /** La stessa porta, dal lato di chi deve ancora attivare l'account. */
  registrati: string;
  etichettaEntra: string;
  autenticato: boolean;
  anno: number;
}) {
  return (
    <div className="os">
      <Regia>
        <UniqueNavbar
          entra={entra}
          registrati={registrati}
          etichettaEntra={etichettaEntra}
          autenticato={autenticato}
        />

        <main id="contenuto">
          <HeroSystem
            entra={entra}
            scopri="#sistema"
            etichettaEntra={etichettaEntra}
          />

          <SystemVisualization />

          {/* Nessun filo attorno al film: la banda scura separa da sé,
              e una riga sottile prima del buio sarebbe un inciampo. Sul
              telefono il buio non c'è — il film è bianco come il resto —
              e il filo se lo disegna il palco: vedi `globals.css`. */}
          <DnaFilm />

          <DataIntelligence />
          <hr className="os-filo" />

          <IntelligenceEngine />
          <hr className="os-filo" />

          <NextBestAction />
          <hr className="os-filo" />

          <LivingSystem />
          <hr className="os-filo" />

          <JourneyTimeline />
          <hr className="os-filo" />

          <PatientClinicConnection />
          <hr className="os-filo" />

          <ProductInterface />
          <hr className="os-filo" />

          <FinalCTA
            entra={entra}
            registrati={registrati}
            etichettaEntra={etichettaEntra}
            autenticato={autenticato}
          />
        </main>

        <UniqueFooter anno={anno} />
      </Regia>
    </div>
  );
}
