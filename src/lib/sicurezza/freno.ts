/**
 * Il freno.
 *
 * Una finestra scorrevole in memoria: quante volte una chiave si è
 * presentata negli ultimi N secondi, e da quale momento potrà
 * ripresentarsi.
 *
 * ---
 *
 * **Va detto subito cosa questo non è.**
 *
 * La memoria è quella del processo. Su Vercel ogni istanza ha la sua, e
 * le istanze si moltiplicano sotto carico: chi attacca da mille
 * indirizzi contro venti istanze si prende venti volte il limite. Questo
 * è un **dosso**, non un muro.
 *
 * Il muro sta altrove e ci sta già: Supabase applica un limite proprio
 * sull'autenticazione, lato suo, condiviso fra tutte le istanze. Il
 * freno qui davanti serve alle cose che Supabase non conosce — una
 * ricerca pazienti ripetuta mille volte, un caricamento in ciclo,
 * l'OCR chiamato a raffica — e serve a non far arrivare fin là il
 * traffico stupido.
 *
 * Scritto così, e non con Redis, perché Redis è un servizio in più da
 * gestire, pagare e tenere acceso, e la protezione che conta contro il
 * furto di credenziali è il secondo fattore, non il conteggio dei
 * tentativi. Il giorno in cui serve davvero, questa interfaccia si
 * reimplementa su un archivio condiviso senza toccare chi la chiama.
 */

export interface Esito {
  /** Falso quando il limite è superato. */
  passa: boolean;
  /** Quanti tentativi restano nella finestra. Zero quando è chiusa. */
  restanti: number;
  /** Fra quanti secondi si riapre. Zero se è aperta. */
  fraSecondi: number;
}

interface Finestra {
  /** Gli istanti dei tentativi ancora dentro la finestra. */
  istanti: number[];
}

/*
 * Una mappa globale, non una per modulo.
 *
 * In sviluppo Next ricarica i moduli a ogni salvataggio: una `const`
 * di modulo verrebbe ricreata, e il limite si azzererebbe a ogni
 * modifica — cioè non si potrebbe provare. `globalThis` sopravvive al
 * ricaricamento.
 */
const CHIAVE_GLOBALE = Symbol.for("unique-os.freno");

type Deposito = Map<string, Finestra>;

function deposito(): Deposito {
  const g = globalThis as unknown as Record<symbol, Deposito | undefined>;
  const esistente = g[CHIAVE_GLOBALE];
  if (esistente) return esistente;

  const nuovo: Deposito = new Map();
  g[CHIAVE_GLOBALE] = nuovo;
  return nuovo;
}

/**
 * I limiti, per contesto.
 *
 * I numeri non sono tondi a caso: sono tarati su cosa fa una persona
 * vera in quel punto. Un medico che cerca un paziente scrive, cancella
 * e riscrive — trenta ricerche al minuto sono plausibili. Cinque
 * tentativi di password in cinque minuti no, e chi ne fa dieci non ha
 * dimenticato la password.
 *
 * Un limite troppo stretto è peggio di nessun limite: la prima volta che
 * blocca un'infermiera durante un turno, qualcuno lo disattiva.
 */
export const LIMITI = {
  /** Password sbagliata. Il conteggio è per email **e** per indirizzo. */
  accesso: { quanti: 5, finestraSec: 300 },
  /** Link via email: ogni tentativo manda posta a qualcuno. */
  link: { quanti: 3, finestraSec: 600 },
  /** Reimpostazione password: stessa ragione. */
  reimposta: { quanti: 3, finestraSec: 900 },
  /** Ricerca pazienti: un medico che digita è veloce. */
  ricerca: { quanti: 30, finestraSec: 60 },
  /** Caricamento documenti: pesa in banda e in OCR. */
  caricamento: { quanti: 20, finestraSec: 300 },
  /** Le chiamate al modello costano denaro a ogni giro. */
  modello: { quanti: 15, finestraSec: 300 },
  /** Invio di messaggi interni. */
  messaggio: { quanti: 40, finestraSec: 60 },
} as const;

export type Contesto = keyof typeof LIMITI;

/**
 * Registra un tentativo e dice se può passare.
 *
 * `adesso` è un argomento e non `Date.now()` dentro: è ciò che rende
 * questa funzione verificabile senza aspettare cinque minuti.
 *
 * Il tentativo **viene contato anche quando non passa**. È voluto: se
 * i tentativi respinti non contassero, chi bussa in continuazione
 * riaprirebbe la finestra appena scaduta e ricomincerebbe, e il limite
 * diventerebbe una cadenza invece di un tetto.
 */
export function chiediPassaggio(
  contesto: Contesto,
  chiave: string,
  adesso: number = Date.now(),
): Esito {
  const { quanti, finestraSec } = LIMITI[contesto];
  const finestraMs = finestraSec * 1000;
  const soglia = adesso - finestraMs;

  const mappa = deposito();
  const id = `${contesto}:${chiave}`;
  const corrente = mappa.get(id) ?? { istanti: [] };

  // Si tengono solo gli istanti ancora dentro la finestra: senza questo
  // la lista crescerebbe per sempre su chiavi molto attive.
  const vivi = corrente.istanti.filter((t) => t > soglia);
  vivi.push(adesso);
  mappa.set(id, { istanti: vivi });

  // Ogni tanto si passa la scopa: senza, le chiavi viste una volta sola
  // resterebbero in memoria finché il processo vive.
  if (mappa.size > 5_000) spazza(mappa, adesso);

  if (vivi.length <= quanti) {
    return { passa: true, restanti: quanti - vivi.length, fraSecondi: 0 };
  }

  // Il più vecchio dei tentativi decide quando la finestra si riapre.
  const piuVecchio = vivi[0] ?? adesso;
  const fra = Math.max(1, Math.ceil((piuVecchio + finestraMs - adesso) / 1000));

  return { passa: false, restanti: 0, fraSecondi: fra };
}

/** Toglie le finestre in cui non è rimasto niente. */
function spazza(mappa: Deposito, adesso: number): void {
  const piuLunga = Math.max(...Object.values(LIMITI).map((l) => l.finestraSec)) * 1000;
  for (const [id, finestra] of mappa) {
    const ultimo = finestra.istanti[finestra.istanti.length - 1] ?? 0;
    if (ultimo < adesso - piuLunga) mappa.delete(id);
  }
}

/** Azzera una chiave. Serve dopo un accesso riuscito, e ai test. */
export function liberaPassaggio(contesto: Contesto, chiave: string): void {
  deposito().delete(`${contesto}:${chiave}`);
}

/**
 * Il messaggio da mostrare.
 *
 * Dice quanto manca e non perché: «hai sbagliato password cinque volte»
 * confermerebbe a chi prova indirizzi altrui che quell'indirizzo esiste.
 */
export function messaggioFreno(esito: Esito): string {
  if (esito.passa) return "";

  if (esito.fraSecondi < 60) {
    return `Troppi tentativi. Riprova fra ${esito.fraSecondi} secondi.`;
  }

  const minuti = Math.ceil(esito.fraSecondi / 60);
  return `Troppi tentativi. Riprova fra ${minuti} ${minuti === 1 ? "minuto" : "minuti"}.`;
}
