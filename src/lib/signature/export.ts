import { SignatureRenderer, type SignatureState } from "@/lib/signature/shader";

/**
 * La Signature come immagine.
 *
 * È la cosa che finisce su un telefono e viene mostrata a un amico: la
 * figura del paziente con il suo punteggio, in formato verticale da
 * social. Stesso shader della pagina, un solo fotogramma a morfosi
 * conclusa, poi il testo sopra con Canvas 2D.
 *
 * Il nome del paziente non c'è, di proposito: chi condivide sa chi è, e
 * un dato sanitario che gira senza nome gira meglio.
 */

export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1350;

export interface ExportOptions {
  state: SignatureState;
  /** "78" */
  scoreLabel: string;
  /** "28 ago 2026" */
  dateLabel: string;
  fileName: string;
}

export type ExportOutcome = "shared" | "downloaded";

async function caricaFont(): Promise<void> {
  if (!document.fonts?.load) return;
  // Se il caricamento fallisce si disegna con il ripiego: l'immagine esce lo stesso.
  await Promise.allSettled([
    document.fonts.load("300 300px Fraunces"),
    document.fonts.load("400 40px Fraunces"),
    document.fonts.load("500 30px Inter"),
  ]);
}

/**
 * Disegna la figura su un canvas fuori schermo. Chi chiama deve rilasciare
 * il renderer dopo aver copiato i pixel: un contesto perso svuota il canvas.
 */
function disegnaFigura(state: SignatureState): { canvas: HTMLCanvasElement; renderer: SignatureRenderer } {
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;

  // preserveDrawingBuffer: il fotogramma va letto dopo il draw, e senza
  // questa opzione il buffer potrebbe essere già stato svuotato.
  const renderer = new SignatureRenderer(canvas, { preserveDrawingBuffer: true });
  renderer.setState(state);
  renderer.frame({
    t: 12.5, // un istante della figura che non sia il primo, troppo simmetrico
    morph: 1,
    vel: 0,
    hov: 0,
    fade: 1,
    mouse: [0.5, 0.5],
  });

  return { canvas, renderer };
}

function componi(figura: HTMLCanvasElement, options: ExportOptions): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D non disponibile");

  const W = EXPORT_WIDTH, H = EXPORT_HEIGHT;

  ctx.drawImage(figura, 0, 0, W, H);

  // Il velo dal basso: il testo si legge, la figura resta protagonista.
  const velo = ctx.createLinearGradient(0, H * 0.45, 0, H);
  velo.addColorStop(0, "rgba(20,20,20,0)");
  velo.addColorStop(1, "rgba(20,20,20,0.88)");
  ctx.fillStyle = velo;
  ctx.fillRect(0, 0, W, H);

  const bone = "#ffffff";
  const margine = 84;

  // ── Marchio, in alto ────────────────────────────────────────────
  ctx.fillStyle = bone;
  ctx.font = "400 40px Fraunces, Georgia, serif";
  ctx.textBaseline = "top";
  ctx.letterSpacing = "0.28em";
  ctx.fillText("UNIQUE", margine, margine);

  ctx.font = "500 18px Inter, system-ui, sans-serif";
  ctx.letterSpacing = "0.3em";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("LONGEVITY CLINIC", margine, margine + 56);

  // ── Etichetta e punteggio, in basso ─────────────────────────────
  ctx.letterSpacing = "0.22em";
  ctx.font = "500 22px Inter, system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("UNIQUE LONGEVITY SCORE", margine, H - margine - 250);

  ctx.letterSpacing = "-0.04em";
  ctx.font = "300 300px Fraunces, Georgia, serif";
  ctx.fillStyle = bone;
  ctx.fillText(options.scoreLabel, margine - 12, H - margine - 8);

  const larghezza = ctx.measureText(options.scoreLabel).width;
  ctx.letterSpacing = "0";
  ctx.font = "400 56px Fraunces, Georgia, serif";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText("/100", margine + larghezza + 6, H - margine - 8);

  ctx.font = "500 24px Inter, system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.textAlign = "right";
  ctx.fillText(options.dateLabel, W - margine, H - margine - 8);
  ctx.textAlign = "left";

  return canvas;
}

function aBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Immagine non generata"))), "image/png");
  });
}

/**
 * Genera l'immagine e la consegna: condivisione nativa dove c'è, altrimenti
 * scaricamento. Su telefono la prima è quella che conta.
 */
export async function exportSignature(options: ExportOptions): Promise<ExportOutcome> {
  await caricaFont();

  const figura = disegnaFigura(options.state);
  let composta: HTMLCanvasElement;
  try {
    composta = componi(figura.canvas, options);
  } finally {
    // Il canvas è usa-e-getta: il contesto si butta via subito, non si
    // aspetta il garbage collector. I browser ne concedono pochi.
    figura.renderer.release();
  }
  const blob = await aBlob(composta);
  const file = new File([blob], options.fileName, { type: "image/png" });

  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
  };

  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "La mia Unique Signature" });
      return "shared";
    } catch (error) {
      // L'utente ha chiuso il foglio di condivisione: non è un errore, e
      // non si ripiega sullo scaricamento contro la sua volontà.
      if (error instanceof Error && error.name === "AbortError") return "shared";
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = options.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
