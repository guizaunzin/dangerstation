/**
 * Relógio de jogo: converte tempo real em passos fixos da simulação.
 * Só conta tempo enquanto não está em pausa; quadros longos (aba em segundo plano) são limitados.
 */
import { BALANCE } from "./config";

export interface ClockState {
  paused: boolean;
  /** Multiplicador do relógio (1 = tempo real). */
  speed: number;
  /** Tempo de jogo acumulado que ainda não virou passo (ms). */
  accumulatorMs: number;
}

/** Maior intervalo real considerado em um quadro, para não "pular" tempo ao voltar para a aba. */
export const MAX_FRAME_MS = 250;
export const MAX_SPEED = 120;

export function createClock(speed = 1, paused = true): ClockState {
  return { paused, speed: clampSpeed(speed), accumulatorMs: 0 };
}

export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return 1;
  return Math.min(MAX_SPEED, speed);
}

export function pause(clock: ClockState): ClockState {
  return { ...clock, paused: true, accumulatorMs: 0 };
}

export function resume(clock: ClockState): ClockState {
  return { ...clock, paused: false };
}

export function tickClock(
  clock: ClockState,
  realDeltaMs: number,
  tickS: number = BALANCE.tickS,
): { clock: ClockState; steps: number } {
  if (clock.paused || !(realDeltaMs > 0)) return { clock, steps: 0 };
  const tickMs = tickS * 1000;
  const acc = clock.accumulatorMs + Math.min(realDeltaMs, MAX_FRAME_MS) * clock.speed;
  const steps = Math.floor(acc / tickMs);
  return { clock: { ...clock, accumulatorMs: acc - steps * tickMs }, steps };
}

/** Lê o multiplicador do relógio da URL (?velocidade=10 ou ?speed=10). */
export function speedFromSearch(search: string): number {
  const params = new URLSearchParams(search);
  const raw = params.get("velocidade") ?? params.get("speed");
  return raw ? clampSpeed(Number(raw)) : 1;
}
