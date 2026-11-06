/**
 * Sons sintetizados com Web Audio (sem arquivos). Só toca depois de um gesto do jogador.
 */
import type { CueKind } from "@/sim/events";

type Note = { f: number; d: number; type?: OscillatorType; at?: number; gain?: number };

const PATTERNS: Record<CueKind, Note[]> = {
  warning: [
    { f: 880, d: 0.09, type: "sine" },
    { f: 880, d: 0.09, type: "sine", at: 0.16 },
  ],
  failure: [
    { f: 620, d: 0.22, type: "square", gain: 0.12 },
    { f: 440, d: 0.22, type: "square", at: 0.24, gain: 0.12 },
    { f: 620, d: 0.22, type: "square", at: 0.48, gain: 0.12 },
    { f: 440, d: 0.22, type: "square", at: 0.72, gain: 0.12 },
  ],
  resolved: [
    { f: 660, d: 0.1, type: "triangle" },
    { f: 990, d: 0.16, type: "triangle", at: 0.1 },
  ],
  critical: [{ f: 300, d: 0.18, type: "sawtooth", gain: 0.1 }],
  won: [
    { f: 523, d: 0.18, type: "triangle" },
    { f: 659, d: 0.18, type: "triangle", at: 0.18 },
    { f: 784, d: 0.18, type: "triangle", at: 0.36 },
    { f: 1046, d: 0.5, type: "triangle", at: 0.54 },
  ],
  lost: [
    { f: 392, d: 0.35, type: "sawtooth", gain: 0.1 },
    { f: 311, d: 0.35, type: "sawtooth", at: 0.35, gain: 0.1 },
    { f: 233, d: 0.8, type: "sawtooth", at: 0.7, gain: 0.1 },
  ],
};

export class SoundBank {
  private ctx: AudioContext | null = null;

  /** Chamar dentro de um gesto do jogador (clique). */
  unlock() {
    if (typeof window === "undefined") return;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  play(kind: CueKind) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    for (const n of PATTERNS[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + (n.at ?? 0);
      const peak = n.gain ?? 0.15;
      osc.type = n.type ?? "sine";
      osc.frequency.value = n.f;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + n.d);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + n.d + 0.02);
    }
  }
}
