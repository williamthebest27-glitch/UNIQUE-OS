/**
 * Motore di movimento, senza dipendenze.
 *
 * Tre cose, e solo tre: uno scroll con peso, i reveal all'ingresso nel
 * viewport, e un unico ciclo rAF a cui gli altri componenti si
 * agganciano. Tutto il resto è CSS.
 *
 * Due regole prese dal mestiere e non negoziabili:
 * - lo scroll morbido muove `window.scrollTo`, mai un wrapper con
 *   transform: altrimenti `position: sticky` e `fixed` smettono di
 *   funzionare;
 * - con `prefers-reduced-motion` il motore non parte, e i reveal
 *   mostrano subito il contenuto. Nessun elemento deve restare nascosto
 *   dietro un'animazione che non gira.
 */

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Tick = (time: number, velocity: number) => void;

interface Engine {
  onTick(fn: Tick): () => void;
  glide(y: number): void;
  destroy(): void;
  reduced: boolean;
}

let instance: Engine | null = null;

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function startEngine(): Engine {
  if (instance) return instance;

  const reduced = reducedMotion();
  const coarse = matchMedia("(pointer:coarse)").matches;
  const ticks = new Set<Tick>();

  let target = scrollY;
  let now = scrollY;
  let lastSet = scrollY;
  let scrolling = false;
  let velocity = 0;
  let prevY = scrollY;
  let raf = 0;
  let alive = true;

  const maxY = () => document.documentElement.scrollHeight - innerHeight;

  // ── Un solo ciclo per tutti ─────────────────────────────────────
  const loop = (time: number) => {
    if (!alive) return;

    if (scrolling) {
      now = lerp(now, target, 0.105);
      if (Math.abs(target - now) < 0.2) {
        now = target;
        scrolling = false;
      }
      scrollTo(0, now);
      lastSet = scrollY;
    }

    const raw = scrollY - prevY;
    prevY = scrollY;
    velocity = lerp(velocity, raw, 0.16);
    // Pubblicata come variabile CSS: anche il foglio di stile può reagire.
    document.documentElement.style.setProperty(
      "--velN",
      clamp(velocity / 55, -1, 1).toFixed(4),
    );

    for (const fn of ticks) fn(time, velocity);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  // ── Scroll con peso: solo desktop, solo senza reduced motion ────
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) return; // lo zoom del browser passa
    e.preventDefault();
    // Se qualcos'altro ci ha mossi — barra, tastiera, ancora — ripartiamo da lì.
    if (!scrolling || Math.abs(scrollY - lastSet) > 2) target = now = scrollY;
    const step = e.deltaMode === 1 ? 22 : e.deltaMode === 2 ? innerHeight : 1;
    target = clamp(target + e.deltaY * step, 0, maxY());
    scrolling = true;
  };

  if (!reduced && !coarse) {
    addEventListener("wheel", onWheel, { passive: false });
  }

  instance = {
    reduced,
    onTick(fn) {
      ticks.add(fn);
      return () => ticks.delete(fn);
    },
    glide(y) {
      if (reduced || coarse) {
        scrollTo({ top: y, behavior: "smooth" });
        return;
      }
      target = now = scrollY;
      target = clamp(y, 0, maxY());
      scrolling = true;
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      removeEventListener("wheel", onWheel);
      ticks.clear();
      instance = null;
    },
  };

  return instance;
}

/* ── Reveal all'ingresso ──────────────────────────────────────────── */

let observer: IntersectionObserver | null = null;

/** Oltre questo tempo, ciò che è ancora nascosto viene mostrato comunque. */
const REVEAL_SAFETY_MS = 4000;

function inViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.top < innerHeight * 0.92 && r.bottom > 0;
}

/**
 * Rivela gli elementi `[data-reveal]`.
 *
 * Ciò che è già nel viewport si rivela **subito**, in modo sincrono: lo
 * scaglionamento lo fa il CSS con `--i`, e la pagina non dipende dal
 * momento in cui un osservatore decide di chiamare. L'osservatore serve
 * solo per quello che arriva scorrendo.
 *
 * E una rete di sicurezza: dopo qualche secondo, tutto ciò che è ancora
 * nascosto viene mostrato. Nessun contenuto deve restare dietro
 * un'animazione che, per qualunque motivo, non è partita.
 */
export function observeReveals(root: ParentNode = document): () => void {
  const targets = [...root.querySelectorAll<HTMLElement>("[data-reveal]:not(.in)")];
  if (targets.length === 0) return () => {};

  if (reducedMotion() || !("IntersectionObserver" in window)) {
    for (const el of targets) el.classList.add("in");
    return () => {};
  }

  const daOsservare: HTMLElement[] = [];
  for (const el of targets) {
    if (inViewport(el)) el.classList.add("in");
    else daOsservare.push(el);
  }

  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("in");
        observer?.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.04 },
  );

  for (const el of daOsservare) observer.observe(el);

  const safety = window.setTimeout(() => {
    for (const el of daOsservare) {
      if (!el.classList.contains("in")) el.classList.add("in");
    }
  }, REVEAL_SAFETY_MS);

  return () => {
    clearTimeout(safety);
    for (const el of daOsservare) observer?.unobserve(el);
  };
}
