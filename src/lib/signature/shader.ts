/**
 * Il renderer della Signature.
 *
 * Condiviso fra il componente in pagina e l'esportatore di immagini: la
 * figura che il paziente vede e quella che condivide devono essere la
 * stessa, non due simili. Un solo shader, un solo posto in cui i sette
 * pilastri diventano forma.
 *
 * La morfosi è nello shader: ogni parametro è un `mix` fra lo stato
 * precedente (q) e quello attuale (p), governato da `morph` 0→1. Il campo
 * di rumore è continuo nei parametri, quindi l'interpolazione produce una
 * trasformazione organica, non una dissolvenza.
 *
 * Le uniform sono impacchettate in vec4. WebGL garantisce solo sedici
 * vettori uniform nel fragment shader, e ogni scalare ne occupa uno
 * intero: ventiquattro scalari sparsi non compilano su una GPU mobile
 * o virtualizzata. Sette vettori entrano ovunque.
 */

export const SIGNATURE_VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}";

export const SIGNATURE_FS = `
precision highp float;
uniform vec4 u0;   // t, seed, vel, hov
uniform vec4 u1;   // fade, morph, score, pscore
uniform vec4 u2;   // res.x, res.y, mouse.x, mouse.y
uniform vec4 pA;   // pilastri 0-3, attuali
uniform vec4 pB;   // pilastri 4-6, attuali
uniform vec4 qA;   // pilastri 0-3, precedenti
uniform vec4 qB;   // pilastri 4-6, precedenti

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
  float t = u0.x, seed = u0.y, vel = u0.z, hov = u0.w;
  float fade = u1.x, morph = u1.y;
  vec2 res = u2.xy, mouse = u2.zw;

  // La morfosi: da com'era a com'è.
  vec4 PA = mix(qA, pA, morph);
  vec4 PB = mix(qB, pB, morph);
  float P0 = PA.x, P1 = PA.y, P2 = PA.z, P3 = PA.w;
  float P4 = PB.x, P5 = PB.y, P6 = PB.z;
  float S = mix(u1.w, u1.z, morph);

  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;

  uv += (mouse - 0.5) * 0.05 * hov;
  uv *= 1.0 + vel * 0.35 * dot(uv, uv);

  float coherence = mix(0.3, 1.0, S);

  // Cardiovascular: il respiro. Movement: la deriva.
  float breath = 1.0 + 0.03 * sin(t * (0.5 + P1 * 0.9));
  float drift = t * (0.025 + P3 * 0.05);

  // Body Composition: la densità delle forme.
  vec2 q = uv * (1.9 + (1.0 - P2) * 1.3) * breath + vec2(seed, seed * 0.37);

  // Metabolic Health: quanto il campo scorre. Mental Wellbeing: la simmetria.
  vec2 w = vec2(
    fbm(q + vec2(drift, 0.0), 5.0),
    fbm(q + vec2(0.0, drift * 0.8) + 3.7, 5.0));
  w.y = mix(w.y, w.x, P5 * 0.55);
  q += w * (0.8 + P0 * 1.3) * coherence;

  float f = fbm(q, 3.0 + coherence * 3.0);
  f += fbm(q * 4.1 + t * 0.04, 3.0) * (1.0 - coherence) * 0.45;

  float r = 1.0 - abs(f);
  r = pow(clamp(r, 0.0, 1.0), 1.6 + coherence * 1.4);

  // Nutrition: il calore. Lifestyle: la luminescenza.
  vec3 ink  = vec3(0.06, 0.11, 0.095);
  vec3 jade = vec3(0.11, 0.58, 0.46);
  vec3 lume = mix(vec3(0.62, 0.95, 0.84), vec3(0.95, 0.82, 0.54), P4);

  vec3 col = mix(ink, jade, smoothstep(0.04, 0.58, r));
  col = mix(col, lume, smoothstep(0.52, 0.94, r) * (0.5 + P6 * 0.5));
  col += lume * pow(r, 5.0) * 0.4 * (0.5 + P6 * 0.5);

  float ring = 1.0 - smoothstep(0.0, 0.012, abs(length(uv) - 0.36));
  col += ring * 0.08;

  col *= 1.0 - dot(uv, uv) * 0.42;
  col += (hash1(gl_FragCoord.xy + t) - 0.5) * 0.03;
  col *= fade;

  gl_FragColor = vec4(col, 1.0);
}`;

export function compileSignature(gl: WebGLRenderingContext): WebGLProgram | null {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error("[signature] shader non compilato:", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const vs = make(gl.VERTEX_SHADER, SIGNATURE_VS);
  const fs = make(gl.FRAGMENT_SHADER, SIGNATURE_FS);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("[signature] programma non collegato:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

/**
 * Sonda su un canvas usa-e-getta, compilando gli shader veri.
 *
 * Un canvas che ha consegnato un contesto WebGL non potrà mai più
 * restituirne uno 2D: se lo shader fallisse dopo, il ripiego non avrebbe
 * dove disegnare.
 */
let probed = false;
export function webglAvailable(): boolean {
  // Si memorizza solo il successo. Un fallimento può essere temporaneo —
  // una scheda aperta in background non ha un contesto WebGL valido — e
  // un "no" ricordato per sempre lascerebbe l'anello anche quando la
  // figura potrebbe disegnarsi.
  if (probed) return true;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") as WebGLRenderingContext | null;
    probed = Boolean(gl && compileSignature(gl));
  } catch {
    probed = false;
  }
  return probed;
}

/** Un numero stabile e diverso per ogni stringa, per il seme della figura. */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 100;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export interface SignatureState {
  /** Sette valori 0–100. Null = non calcolabile. */
  pillars: (number | null)[];
  /** Lo stato precedente, per la morfosi. Null = nessuna morfosi. */
  previousPillars: (number | null)[] | null;
  score: number;
  previousScore: number | null;
  seed: string;
}

export interface FrameParams {
  t: number;
  /** 0 = com'era, 1 = com'è. */
  morph: number;
  vel: number;
  hov: number;
  fade: number;
  mouse: [number, number];
}

function normalizzato(v: number | null | undefined): number {
  return v === null || v === undefined ? 0.5 : clamp01(v / 100);
}

export class SignatureRenderer {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private buf: WebGLBuffer | null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private seed = 0;
  private score = 0.5;
  private previousScore = 0.5;

  constructor(
    readonly canvas: HTMLCanvasElement,
    options: { preserveDrawingBuffer?: boolean } = {},
  ) {
    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    }) as WebGLRenderingContext | null;
    if (!gl) throw new Error("WebGL non disponibile");

    const prog = compileSignature(gl);
    if (!prog) throw new Error("Shader della Signature non compilato");

    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    for (const name of ["u0", "u1", "u2", "pA", "pB", "qA", "qB"]) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }

    this.gl = gl;
    this.prog = prog;
    this.buf = buf;
  }

  /** I parametri della figura: si impostano una volta, non a ogni frame. */
  setState(state: SignatureState): void {
    const { gl, u } = this;
    const p = state.pillars.map(normalizzato);
    const q = (state.previousPillars ?? state.pillars).map(normalizzato);
    const at = (arr: number[], i: number) => arr[i] ?? 0.5;

    gl.uniform4f(u.pA, at(p, 0), at(p, 1), at(p, 2), at(p, 3));
    gl.uniform4f(u.pB, at(p, 4), at(p, 5), at(p, 6), 0);
    gl.uniform4f(u.qA, at(q, 0), at(q, 1), at(q, 2), at(q, 3));
    gl.uniform4f(u.qB, at(q, 4), at(q, 5), at(q, 6), 0);

    this.seed = seedFrom(state.seed);
    this.score = clamp01(state.score / 100);
    this.previousScore = clamp01((state.previousScore ?? state.score) / 100);
  }

  /** Ridimensiona il buffer alla misura del canvas in pagina. */
  fit(maxDpr = 1.75): void {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const dpr = Math.min(maxDpr, devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  frame(params: FrameParams): void {
    const { gl, u, canvas } = this;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform4f(u.u0, params.t, this.seed, params.vel, params.hov);
    gl.uniform4f(u.u1, params.fade, clamp01(params.morph), this.score, this.previousScore);
    gl.uniform4f(u.u2, canvas.width, canvas.height, params.mouse[0], params.mouse[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Libera programma e buffer, ma lascia vivo il contesto.
   *
   * Un canvas può essere rimontato — React in sviluppo monta ogni effetto
   * due volte — e `getContext` restituisce sempre lo stesso contesto: se
   * fosse stato perso, il secondo montaggio troverebbe un contesto morto e
   * la Signature cadrebbe sull'anello senza motivo.
   */
  dispose(): void {
    const { gl } = this;
    gl.deleteProgram(this.prog);
    gl.deleteBuffer(this.buf);
  }

  /** Come `dispose`, e butta via anche il contesto: per i canvas usa-e-getta. */
  release(): void {
    this.dispose();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
