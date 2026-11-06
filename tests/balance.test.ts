import { describe, expect, it } from "vitest";
import { BALANCE } from "@/sim/config";
import { runBot, runIdle, type RepairPolicy } from "@/sim/bot";
import { computeModifiers } from "@/sim/engine";
import { trainingMission } from "@/sim/random";
import type { DifficultyId } from "@/sim/types";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => `T${i}`);

function winRate(difficulty: DifficultyId, policy: RepairPolicy, n: number, reactionS = 5) {
  const wins = seeds(n).filter((seed) => runBot({ kind: "random", seed, difficulty }, { policy, reactionS }).outcome?.result === "won");
  return wins.length / n;
}

describe("balanceamento do treinamento (relógio acelerado)", () => {
  it("inação: manter a distribuição inicial leva à derrota", () => {
    const end = runIdle(trainingMission());
    expect(end.outcome?.result).toBe("lost");
    expect(end.t).toBeLessThan(BALANCE.missionDurationS);
  });

  it.each(["quick", "full"] as RepairPolicy[])("só respostas %s também vence, com decisões diferentes", (policy) => {
    const end = runBot(trainingMission(), { policy, reactionS: 5 });
    expect(end.outcome?.result).toBe("won");
    expect(end.failures.every((f) => f.resolution === policy)).toBe(true);
  });

  it("as rotas deixam consequências diferentes no módulo", () => {
    const quick = runBot(trainingMission(), { policy: "quick", reactionS: 5 });
    const full = runBot(trainingMission(), { policy: "full", reactionS: 5 });
    expect(computeModifiers(quick)).not.toEqual(computeModifiers(full));
    expect(computeModifiers(full)).toMatchObject({ generatorFactor: 1, coolingFactor: 1, leakPerS: 0, extraHeatPerS: 0 });
  });
});

describe("balanceamento das missões sorteadas", () => {
  it.each(["cadet", "engineer", "commander"] as DifficultyId[])("inação sempre perde em %s", (difficulty) => {
    for (const seed of seeds(20)) expect(runIdle({ kind: "random", seed, difficulty }).outcome?.result).toBe("lost");
  });

  it("as dificuldades ficam em ordem e o Comandante não é garantido", () => {
    const cadet = winRate("cadet", "smart", 30);
    const engineer = winRate("engineer", "smart", 30);
    const commander = winRate("commander", "smart", 30);
    expect(cadet).toBeGreaterThanOrEqual(0.95);
    expect(engineer).toBeGreaterThanOrEqual(0.75);
    expect(commander).toBeLessThan(engineer);
    expect(commander).toBeGreaterThan(0.2);
    expect(commander).toBeLessThan(0.9);
  });

  it("no Engenheiro, insistir só em reparos completos é uma má estratégia", () => {
    expect(winRate("engineer", "full", 30)).toBeLessThan(winRate("engineer", "smart", 30));
  });
});
