import type { IconaSezione } from "@/lib/patient/sezioni";
import {
  BellIcon,
  CalendarIcon,
  CreditIcon,
  DocumentIcon,
  HomeIcon,
  PathIcon,
  SparkIcon,
  TaskIcon,
} from "@/components/ui/primitives";

/**
 * Le icone delle sezioni del paziente.
 *
 * Tratto di 1,6, nessun riempimento, tutte disegnate sulla stessa
 * griglia da 24: un'icona più pesante delle altre sposta l'occhio senza
 * dire niente. Quelle che mancavano stanno qui; le altre si riusano da
 * `primitives`, dove vivono da prima.
 */

type Props = { className?: string };

function ScoreIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 3.75a8.25 8.25 0 0 1 7.4 4.6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function LabIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 3v6.2L5.4 17.4A2 2 0 0 0 7.1 20.5h9.8a2 2 0 0 0 1.7-3.1L14 9.2V3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 3h6M7.6 14.5h8.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TrendIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 20V4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 20h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="m7.5 15.5 3.5-4 3 2.5 5-6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M20 12.5c0 3.7-3.6 6.7-8 6.7-.9 0-1.8-.1-2.6-.4L4.5 20.5l1.2-3.4C4.6 15.9 4 14.3 4 12.5 4 8.8 7.6 5.8 12 5.8s8 3 8 6.7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PersonIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.75" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4.75 20c0-3.6 3.2-6 7.25-6s7.25 2.4 7.25 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AiIcon({ className }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3.2 13.6 8 18.4 9.6 13.6 11.2 12 16l-1.6-4.8L5.6 9.6 10.4 8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M17.8 15.2 18.6 17.6 21 18.4l-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8z" fill="currentColor" />
    </svg>
  );
}

const MAPPA: Record<IconaSezione, (p: Props) => React.ReactElement> = {
  home: HomeIcon,
  score: ScoreIcon,
  percorso: PathIcon,
  piano: TaskIcon,
  risultati: LabIcon,
  progressi: TrendIcon,
  questionari: SparkIcon,
  documenti: DocumentIcon,
  appuntamenti: CalendarIcon,
  messaggi: ChatIcon,
  membership: CreditIcon,
  assistente: AiIcon,
  profilo: PersonIcon,
  notifiche: BellIcon,
};

export function IconaDiSezione({ nome, className }: { nome: IconaSezione; className?: string }) {
  const Componente = MAPPA[nome];
  return <Componente className={className} />;
}
