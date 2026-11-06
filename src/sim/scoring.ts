/**
 * Pontuação, medalhas e recordes locais.
 */
import { BALANCE, DIFFICULTIES, RECORDS_KEY } from "./config";
import { batteryPct } from "./engine";
import type { KeyValueStorage } from "./persistence";
import type { MissionSpec, SimState } from "./types";

export type Medal = "gold" | "silver" | "bronze";

export const MEDAL_LABEL: Record<Medal, string> = { gold: "Ouro", silver: "Prata", bronze: "Bronze" };

export interface ScoreItem {
  label: string;
  points: number;
}

export interface Score {
  items: ScoreItem[];
  base: number;
  multiplier: number;
  total: number;
  medal: Medal | null;
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

export function computeScore(state: SimState): Score {
  const b = BALANCE;
  const won = state.outcome?.result === "won";
  const items: ScoreItem[] = [];
  items.push({
    label: won ? "Resgate concluído" : `Sobrevivência (${Math.round((state.t / b.missionDurationS) * 100)}% da missão)`,
    points: Math.round(400 * (won ? 1 : state.t / b.missionDurationS)),
  });
  if (won) {
    items.push({ label: "Margem de calor no resgate", points: Math.round(150 * clamp01((b.heat.criticalC - state.heatC) / 40)) });
    items.push({ label: "Oxigênio no resgate", points: Math.round(150 * clamp01((state.oxygenPct - b.oxygen.criticalPct) / 60)) });
    items.push({ label: "Reserva da bateria", points: Math.round(100 * clamp01(batteryPct(state) / 100)) });
  }
  const resolved = state.failures.filter((f) => f.status === "resolved").length;
  const total = state.failures.length;
  items.push({ label: `Falhas resolvidas (${resolved}/${total})`, points: total ? Math.round((150 * resolved) / total) : 0 });
  if (state.stats.criticalSeconds > 0) {
    items.push({ label: `Tempo em nível crítico (${state.stats.criticalSeconds} s)`, points: -3 * state.stats.criticalSeconds });
  }
  const base = Math.max(0, items.reduce((s, i) => s + i.points, 0));
  const diff = DIFFICULTIES[state.mission.difficulty];
  const multiplier = diff.scoreMultiplier;
  const medal: Medal | null = !won
    ? null
    : base >= diff.medals.gold
      ? "gold"
      : base >= diff.medals.silver
        ? "silver"
        : "bronze";
  return { items, base, multiplier, total: Math.round(base * multiplier), medal };
}

// ———————————————————— recordes

export interface RecordEntry {
  best: number;
  medal: Medal | null;
  bestSeed: string;
  plays: number;
  wins: number;
}

export type Records = Record<string, RecordEntry>;

/** Chave do recorde: treinamento, missão aleatória por dificuldade ou desafio de um dia. */
export function recordKey(m: MissionSpec): string {
  if (m.kind === "training") return "training";
  if (m.kind === "daily") return `daily:${m.seed}`;
  return `random:${m.difficulty}`;
}

const MEDAL_RANK: Record<Medal, number> = { bronze: 1, silver: 2, gold: 3 };

export function loadRecords(storage: KeyValueStorage): Records {
  try {
    const raw = storage.getItem(RECORDS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Records) : {};
  } catch {
    return {};
  }
}

export interface RecordResult {
  records: Records;
  entry: RecordEntry;
  isNewBest: boolean;
}

/** Registra o resultado de uma missão encerrada. Puro: devolve os recordes atualizados. */
export function applyResult(records: Records, state: SimState): RecordResult {
  const key = recordKey(state.mission);
  const score = computeScore(state);
  const prev = records[key] ?? { best: 0, medal: null, bestSeed: state.mission.seed, plays: 0, wins: 0 };
  const isNewBest = score.total > prev.best;
  const betterMedal = score.medal && (!prev.medal || MEDAL_RANK[score.medal] > MEDAL_RANK[prev.medal]);
  const entry: RecordEntry = {
    best: Math.max(prev.best, score.total),
    bestSeed: isNewBest ? state.mission.seed : prev.bestSeed,
    medal: betterMedal ? score.medal : prev.medal,
    plays: prev.plays + 1,
    wins: prev.wins + (state.outcome?.result === "won" ? 1 : 0),
  };
  return { records: { ...records, [key]: entry }, entry, isNewBest };
}

export function saveRecords(storage: KeyValueStorage, records: Records) {
  try {
    storage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // ignorado
  }
}
