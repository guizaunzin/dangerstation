/**
 * Sorteio reproduzível das missões. A mesma semente e a mesma dificuldade
 * geram sempre a mesma sequência de falhas.
 */
import { BALANCE, DIFFICULTIES, FAILURE_IDS, TRAINING, trainingSchedule } from "./config";
import type { DifficultyId, MissionSpec, ScheduledFailure } from "./types";

/** Hash FNV-1a de 32 bits. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Gerador pseudoaleatório mulberry32: rápido, determinístico e suficiente para jogo. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Normaliza uma semente digitada: maiúsculas, sem espaços, até 12 caracteres. */
export function normalizeSeed(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 12);
}

/** Semente nova e legível, como "K7Q-2MX". `rand` permite testes determinísticos. */
export function newSeed(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += SEED_ALPHABET[Math.floor(rand() * SEED_ALPHABET.length)];
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

/** Semente do desafio do dia (data local). */
export function dailySeed(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `DIA-${y}${m}${d}`;
}

export function scheduleFor(mission: MissionSpec): ScheduledFailure[] {
  if (mission.kind === "training") return trainingSchedule();
  return generateSchedule(mission.seed, mission.difficulty);
}

export function generateSchedule(seed: string, difficulty: DifficultyId): ScheduledFailure[] {
  const diff = DIFFICULTIES[difficulty];
  const rand = mulberry32(hashSeed(`${seed}|${difficulty}`));
  const sc = BALANCE.schedule;

  // Escolhe os tipos (sem repetição) embaralhando o catálogo.
  const pool = [...FAILURE_IDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const types = pool.slice(0, Math.min(diff.failureCount, pool.length));

  // Distribui os instantes em janelas iguais, com variação dentro de cada janela.
  const start = sc.firstAtS;
  const end = BALANCE.missionDurationS - sc.lastBeforeEndS;
  const slot = (end - start) / types.length;
  return types.map((id, i) => {
    const at = Math.round(start + slot * i + rand() * slot * 0.6);
    const jitter = 1 + (rand() * 2 - 1) * sc.severityJitter;
    return {
      id,
      at,
      warnAt: Math.max(1, at - diff.warningLeadS),
      severity: Math.round(diff.severity * jitter * 100) / 100,
    };
  });
}

export function trainingMission(): MissionSpec {
  return { kind: "training", seed: TRAINING.seed, difficulty: TRAINING.difficulty };
}
