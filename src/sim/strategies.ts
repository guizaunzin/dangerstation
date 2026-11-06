/**
 * Rotas roteirizadas usadas pelos testes de balanceamento e por `npm run balance`.
 * Cada rota é uma lista de ações em instantes fixos do relógio de jogo.
 */
import {
  advance,
  beginMission,
  createInitialState,
  DEFAULT_CONFIG,
  setAllocation,
  startRepair,
  type SimConfig,
} from "./engine";
import type { FailureId, RepairOptionId, SimState, SystemId } from "./types";

export type ScriptAction =
  | { at: number; type: "alloc"; system: SystemId; kw: number }
  | { at: number; type: "repair"; failure: FailureId; option: RepairOptionId };

export interface Route {
  id: string;
  name: string;
  description: string;
  actions: ScriptAction[];
}

const alloc = (at: number, cooling: number, life: number): ScriptAction[] => [
  { at, type: "alloc", system: "cooling", kw: cooling },
  { at, type: "alloc", system: "life", kw: life },
];

export const ROUTES: Record<string, Route> = {
  inaction: {
    id: "inaction",
    name: "Inação",
    description: "Mantém a distribuição inicial e não repara nada.",
    actions: [],
  },
  quick: {
    id: "quick",
    name: "Remendos rápidos",
    description: "Resolve cada falha com a resposta rápida e compensa os efeitos residuais na distribuição.",
    actions: [
      ...alloc(0, 4, 4),
      { at: 150, type: "repair", failure: "generator", option: "quick" },
      ...alloc(150, 4, 3),
      ...alloc(185, 5, 3),
      { at: 480, type: "repair", failure: "cooling", option: "quick" },
      ...alloc(480, 6, 3),
      { at: 780, type: "repair", failure: "leak", option: "quick" },
      ...alloc(780, 6, 4),
    ],
  },
  full: {
    id: "full",
    name: "Reparos completos",
    description: "Aceita o custo alto agora para eliminar cada falha por completo.",
    actions: [
      ...alloc(0, 4, 4),
      { at: 150, type: "repair", failure: "generator", option: "full" },
      ...alloc(150, 4, 3),
      ...alloc(245, 4, 4),
      { at: 480, type: "repair", failure: "cooling", option: "full" },
      ...alloc(480, 6, 3),
      ...alloc(585, 5, 4),
      { at: 780, type: "repair", failure: "leak", option: "full" },
      ...alloc(780, 5, 5),
      ...alloc(865, 5, 4),
    ],
  },
  repairsOnlyQuick: {
    id: "repairsOnlyQuick",
    name: "Só remendos, distribuição fixa",
    description: "Faz os reparos rápidos assim que as falhas aparecem, mas nunca mexe na distribuição inicial.",
    actions: [
      { at: 150, type: "repair", failure: "generator", option: "quick" },
      { at: 480, type: "repair", failure: "cooling", option: "quick" },
      { at: 780, type: "repair", failure: "leak", option: "quick" },
    ],
  },
  repairsOnlyFull: {
    id: "repairsOnlyFull",
    name: "Só reparos completos, distribuição fixa",
    description: "Faz os reparos completos assim que as falhas aparecem, mas nunca mexe na distribuição inicial.",
    actions: [
      { at: 150, type: "repair", failure: "generator", option: "full" },
      { at: 480, type: "repair", failure: "cooling", option: "full" },
      { at: 780, type: "repair", failure: "leak", option: "full" },
    ],
  },
  mixed: {
    id: "mixed",
    name: "Rota mista",
    description: "Recalibra o gerador por completo, purga a refrigeração e faz a vedação rápida.",
    actions: [
      ...alloc(0, 4, 4),
      { at: 150, type: "repair", failure: "generator", option: "full" },
      ...alloc(150, 4, 3),
      ...alloc(245, 4, 4),
      { at: 480, type: "repair", failure: "cooling", option: "quick" },
      ...alloc(480, 6, 4),
      { at: 780, type: "repair", failure: "leak", option: "quick" },
      ...alloc(780, 6, 5),
    ],
  },
};

/** Executa uma rota do início até o fim da missão (ou até a derrota). */
export function runRoute(route: Route, cfg: SimConfig = DEFAULT_CONFIG, until?: number): SimState {
  let s = beginMission(createInitialState(cfg), cfg);
  const end = until ?? cfg.balance.missionDurationS;
  const actions = [...route.actions].sort((a, b) => a.at - b.at);
  let i = 0;
  while (s.phase === "active" && s.t < end) {
    while (i < actions.length && actions[i].at <= s.t) {
      const a = actions[i++];
      s = a.type === "alloc" ? setAllocation(s, a.system, a.kw, cfg) : startRepair(s, a.failure, a.option, cfg);
    }
    s = advance(s, cfg.balance.tickS, cfg);
  }
  return s;
}
