/**
 * Salvamento local. A simulação é serializável em JSON; aqui só validamos e versionamos.
 */
import { DIFFICULTIES, FAILURES, SAVE_KEY, SAVE_VERSION } from "./config";
import type { SimState } from "./types";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SaveEnvelope {
  v: number;
  savedAt: number;
  state: SimState;
}

export function serialize(state: SimState, now = Date.now()): string {
  const envelope: SaveEnvelope = { v: SAVE_VERSION, savedAt: now, state };
  return JSON.stringify(envelope);
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Devolve o estado salvo ou null se o conteúdo estiver ausente, corrompido ou for de outra versão. */
export function deserialize(raw: string | null): SimState | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const env = parsed as Partial<SaveEnvelope>;
  if (env.v !== SAVE_VERSION || !env.state || typeof env.state !== "object") return null;
  const s = env.state as SimState;
  const ok =
    s.version === SAVE_VERSION &&
    !!s.mission &&
    ["training", "random", "daily"].includes(s.mission.kind) &&
    typeof s.mission.seed === "string" &&
    s.mission.difficulty in DIFFICULTIES &&
    ["intro", "active", "ended"].includes(s.phase) &&
    isNumber(s.t) &&
    isNumber(s.batteryKj) &&
    isNumber(s.heatC) &&
    isNumber(s.oxygenPct) &&
    !!s.allocation &&
    isNumber(s.allocation.cooling) &&
    isNumber(s.allocation.life) &&
    isNumber(s.allocation.repair) &&
    Array.isArray(s.failures) &&
    s.failures.length > 0 &&
    s.failures.every((f) => f && f.id in FAILURES && isNumber(f.at) && isNumber(f.severity) && isNumber(f.escalation) && ["none", "new", "ignored", "handled"].includes(f.ack)) &&
    (s.queue === null || (typeof s.queue === "object" && s.queue.failureId in FAILURES)) &&
    Array.isArray(s.log) &&
    !!s.critical &&
    isNumber(s.critical.heat) &&
    isNumber(s.critical.oxygen) &&
    !!s.stats &&
    !!s.tutorial;
  return ok ? s : null;
}

export function saveGame(storage: KeyValueStorage, state: SimState): void {
  try {
    storage.setItem(SAVE_KEY, serialize(state));
  } catch {
    // Armazenamento cheio ou bloqueado: o jogo continua sem salvar.
  }
}

export function loadGame(storage: KeyValueStorage): SimState | null {
  try {
    return deserialize(storage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

export function clearSave(storage: KeyValueStorage): void {
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // ignorado
  }
}

/** Armazenamento em memória para testes e para quando o localStorage não existir. */
export function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
