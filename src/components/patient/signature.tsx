"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { clamp, lerp, reducedMotion, startEngine } from "@/lib/motion/engine";

/**
 * La Signature.
 *
 * Un organismo generativo, unico per ogni paziente, la cui forma è
 * derivata dai sette pilastri dello Score. Non è decorazione: la forma
 * è il dato. Un punteggio basso è turbolento e cupo, uno alto è ordinato
 * e luminoso, e la figura cambia mentre la salute cambia.
 *
 * Ogni pilastro governa un aspetto:
 *   Metabolic Health   → quanto il campo scorre (intensità della deformazione)
 *   Cardiovascular     → il ritmo del respiro (pulsazione)
 *   Body Composition   → la densità delle forme
 *   Movement           → la velocità di deriva
 *   Nutrition          → il calore della luce
 *   Mental Wellbeing   → la simmetria, la coerenza
 *   Lifestyle          → l'intensità della luminescenza
 *
 * Il seme è l'id del paziente: due persone con gli stessi numeri hanno
 * comunque due figure diverse, perché sono due persone.
 */

const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}";

const FS = `
precision highp float;
uniform float t, seed, score, vel, hov, fade;
uniform vec2 res, mouse;
uniform float p0, p1, p2, p3, p4, p5, p6;

float hash1(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453123); }

vec2 hash2(vec2 q){
  q = vec2(dot(q, vec2(127.1, 311.7)), dot(q, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(q) * 43758.5453123);
}

float noise(vec2 q){
  vec2 i = floor(q), f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i), f), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 q, float octaves){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= octaves) break;
    s += a * noise(q);
    q = q * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;

  // Parallasse appena percettibile, e una leggera bombatura con lo scroll.
  uv += (mouse - 0.5) * 0.05 * hov;
  uv *= 1.0 + vel * 0.35 * dot(uv, uv);

  float coherence = mix(0.3, 1.0, score);

  // Cardiovascular: il respiro. Movement: la deriva.
  float breath = 1.0 + 0.03 * sin(t * (0.5 + p1 * 0.9));
  float drift = t * (0.025 + p3 * 0.05);

  // Body Composition: la densità delle forme.
  vec2 q = uv * (1.9 + (1.0 - p2) * 1.3) * breath + vec2(seed, seed * 0.37);

  // Metabolic Health: quanto il campo scorre. Mental Wellbeing: la simmetria.
  vec2 w = vec2(
    fbm(q + vec2(drift, 0.0), 5.0),
    fbm(q + vec2(0.0, drift * 0.8) + 3.7, 5.0));
  w.y = mix(w.y, w.x, p5 * 0.55);
  q += w * (0.8 + p0 * 1.3) * coherence;

  float f = fbm(q, 3.0 + coherence * 3.0);
  // Con poca coerenza il campo si sporca di dettaglio fine.
  f += fbm(q * 4.1 + t * 0.04, 3.0) * (1.0 - coherence) * 0.45;

  // Le creste diventano filamenti. L'esponente decide quanto sono
  // sottili: troppo alto, e la figura sparisce nel buio.
  float r = 1.0 - abs(f);
  r = pow(clamp(r, 0.0, 1.0), 1.6 + coherence * 1.4);

  // Nutrition: il calore. Lifestyle: la luminescenza.
  vec3 ink  = vec3(0.06, 0.11, 0.095);
  vec3 jade = vec3(0.11, 0.58, 0.46);
  vec3 lume = mix(vec3(0.62, 0.95, 0.84), vec3(0.95, 0.82, 0.54), p4);

  vec3 col = mix(ink, jade, smoothstep(0.04, 0.58, r));
  col = mix(col, lume, smoothstep(0.52, 0.94, r) * (0.5 + p6 * 0.5));
  // Il bagliore che i filamenti diffondono attorno a sé.
  col += lume * pow(r, 5.0) * 0.4 * (0.5 + p6 * 0.5);

  // Un anello appena visibile: la soglia dove il punteggio si legge.
  float ring = 1.0 - smoothstep(0.0, 0.012, abs(length(uv) - 0.36));
  col += ring * 0.08;

  col *= 1.0 - dot(uv, uv) * 0.42;                      // vignetta
  col += (hash1(gl_FragCoord.xy + t) - 0.5) * 0.03;    // grana
  col *= fade;

  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGLRenderingContext): WebGLProgram | null {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = make(gl.VERTEX_SHADER, VS);
  const fs = make(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  return gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null;
}

/**
 * Sonda su un canvas usa-e-getta, compilando gli shader veri.
 *
 * Un canvas che ha consegnato un contesto WebGL non potrà mai più
 * restituirne uno 2D: se lo shader fallisse dopo, il ripiego non avrebbe
 * dove disegnare e la sezione resterebbe vuota.
 */
let probed: boolean | null = null;
function webglOk(): boolean {
  if (probed !== null) return probed;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") as WebGLRenderingContext | null;
    probed = Boolean(gl && compile(gl));
  } catch {
    probed = false;
  }
  return probed;
}

/** Un numero stabile e diverso per ogni stringa, per il seme della figura. */
function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 100;
}

export interface SignatureProps {
  /** Sette valori 0–100, nell'ordine dei pilastri. Null = non calcolabile. */
  pillars: (number | null)[];
  /** 0–100. */
  score: number;
  seed: string;
  className?: string;
  /** Mostrato quando WebGL non è disponibile o il movimento è ridotto. */
  fallback: ReactNode;
}

export function Signature({ pillars, score, seed, className, fallback }: SignatureProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (reducedMotion() || !webglOk()) {
      setReady(false);
      return;
    }

    const canvas = ref.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    const prog = gl ? compile(gl) : null;
    if (!gl || !prog) {
      setReady(false);
      return;
    }

    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = (n: string) => gl.getUniformLocation(prog, n);
    const uT = U("t"), uSeed = U("seed"), uScore = U("score"), uVel = U("vel");
    const uHov = U("hov"), uFade = U("fade"), uRes = U("res"), uMouse = U("mouse");
    const uP = [0, 1, 2, 3, 4, 5, 6].map((i) => U(`p${i}`));

    // I pilastri arrivano una volta: non cambiano fra un frame e l'altro.
    for (let i = 0; i < 7; i++) {
      const v = pillars[i];
      gl.uniform1f(uP[i], v === null || v === undefined ? 0.5 : clamp(v / 100, 0, 1));
    }
    gl.uniform1f(uSeed, seedFrom(seed));
    gl.uniform1f(uScore, clamp(score / 100, 0, 1));

    // ── Dimensioni: dall'osservatore, mai dal solo resize ─────────
    const size = () => {
      const r = canvas.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const dpr = Math.min(1.75, devicePixelRatio || 1);
      const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(canvas);

    // ── Puntatore ─────────────────────────────────────────────────
    let mx = 0.5, my = 0.5, hov = 0, hovTarget = 0;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width;
      my = 1 - (e.clientY - r.top) / r.height;
    };
    const onEnter = () => (hovTarget = 1);
    const onLeave = () => (hovTarget = 0);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerenter", onEnter);
    canvas.addEventListener("pointerleave", onLeave);

    // ── Rendering, agganciato all'unico ciclo del motore ──────────
    const engine = startEngine();
    const t0 = performance.now();
    let fade = 0;
    let hidden = document.visibilityState === "hidden";
    const onVis = () => (hidden = document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVis);

    const stop = engine.onTick((time, velocity) => {
      if (hidden) return;
      const r = canvas.getBoundingClientRect();
      // Fuori dallo schermo non si disegna.
      if (r.bottom < -80 || r.top > innerHeight + 80) return;

      hov = lerp(hov, hovTarget, 0.08);
      fade = lerp(fade, 1, 0.045);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(uT, (time - t0) / 1000);
      gl.uniform1f(uVel, clamp(velocity / 900, -0.12, 0.12));
      gl.uniform1f(uHov, hov);
      gl.uniform1f(uFade, fade);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mx, my);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });

    setReady(true);

    return () => {
      stop();
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerenter", onEnter);
      canvas.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pillars, score, seed]);

  if (ready === false) return <>{fallback}</>;

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden="true"
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
