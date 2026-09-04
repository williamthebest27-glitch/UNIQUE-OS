import { esci } from "@/lib/auth-actions";
import { cx } from "@/components/ui/primitives";

/**
 * Chi sono e come esco.
 *
 * Stava in fondo alla colonna di sinistra, ed era il posto sbagliato:
 * per uscire da un'applicazione si guarda in alto a destra, non giù nel
 * piede del menu. Adesso paziente, area clinica e Control Center dicono
 * la stessa cosa nello stesso angolo dello schermo.
 *
 * Il componente è condiviso perché le tre aree devono restare
 * indistinguibili proprio qui: è l'unico punto della pagina in cui
 * l'utente cerca sé stesso, e trovarlo diverso ogni volta è già un
 * intoppo.
 */

function Iniziali({ nome }: { nome: string }) {
  const iniziali =
    nome
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[13px] font-semibold text-bone-50"
    >
      {iniziali}
    </span>
  );
}

/** Il pallino con le iniziali, il nome, il modo di uscire. */
export function BloccoUtente({ nome, className }: { nome: string; className?: string }) {
  return (
    <div className={cx("flex min-w-0 items-center gap-2 sm:gap-2.5", className)}>
      <Iniziali nome={nome} />

      {/* Il nome si legge a ogni larghezza. Su telefono lo spazio glielo
          fa il marchio, ridotto al simbolo: un nome tagliato a metà vale
          meno di un logotipo che lì si è già visto entrando. */}
      <span className="min-w-0 max-w-[130px] truncate text-sm font-medium text-ink-900 sm:max-w-[180px]">
        {nome}
      </span>

      <form action={esci}>
        <button
          type="submit"
          className="rounded-full border border-bone-200 px-3 py-1.5 text-xs font-medium text-ink-500 transition-colors hover:border-bone-300 hover:bg-bone-100 hover:text-ink-900"
        >
          Esci
        </button>
      </form>
    </div>
  );
}

/**
 * La fascia in cima al contenuto.
 *
 * Il marchio compare solo su telefono, dove la colonna di sinistra non
 * c'è: da tablet in su lo si è già letto lì, e ripeterlo sposterebbe
 * soltanto in basso la prima riga della pagina. A destra invece c'è
 * sempre tutto, a ogni larghezza.
 */
export function BarraSuperiore({
  simbolo,
  azioni,
  nome,
}: {
  /** Il marchio per il telefono: il solo simbolo, non il logotipo intero. */
  simbolo: React.ReactNode;
  /** Ciò che sta a sinistra del blocco utente: la campanella, di norma. */
  azioni?: React.ReactNode;
  nome: string;
}) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-bone-200 bg-bone-50/95 px-5 py-3.5 backdrop-blur sm:gap-3 sm:px-8 lg:px-12">
      <div className="shrink-0 md:hidden">{simbolo}</div>

      {/* `ml-auto` invece di `justify-between`: a destra ci va comunque,
          che il simbolo a sinistra ci sia o no. */}
      <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
        {azioni}
        <BloccoUtente nome={nome} />
      </div>
    </header>
  );
}
