import { describe, expect, it } from "vitest";
import { BALANCE, DIFFICULTIES, FAILURE_IDS } from "@/sim/config";
import { runBot, runIdle } from "@/sim/bot";
import { createInitialState } from "@/sim/engine";
import { cuesBetween } from "@/sim/events";
import { dailySeed, generateSchedule, mulberry32, newSeed, normalizeSeed, trainingMission } from "@/sim/random";
import { applyResult, computeScore, recordKey } from "@/sim/scoring";
import type { DifficultyId } from "@/sim/types";
import { activate, quiet } from "./helpers";

describe("sorteio das missões", () => {
  it("mesma semente e dificuldade geram a mesma missão", () => {
    expect(generateSchedule("ABC-123", "engineer")).toEqual(generateSchedule("ABC-123", "engineer"));
    expect(generateSchedule("ABC-123", "engineer")).not.toEqual(generateSchedule("ABC-124", "engineer"));
  });

  it.each(["cadet", "engineer", "commander"] as DifficultyId[])("%s: quantidade, tipos sem repetição e horários válidos", (d) => {
    for (let i = 0; i < 50; i++) {
      const sch = generateSchedule(`S${i}`, d);
      expect(sch).toHaveLength(DIFFICULTIES[d].failureCount);
      expect(new Set(sch.map((f) => f.id)).size).toBe(sch.length);
      for (const f of sch) {
        expect(FAILURE_IDS).toContain(f.id);
        expect(f.at).toBeGreaterThanOrEqual(BALANCE.schedule.firstAtS);
        expect(f.at).toBeLessThanOrEqual(BALANCE.missionDurationS - BALANCE.schedule.lastBeforeEndS);
        expect(f.at - f.warnAt).toBe(DIFFICULTIES[d].warningLeadS);
      }
      const times = sch.map((f) => f.at);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });

  it("sorteia combinações variadas de falhas", () => {
    const combos = new Set(Array.from({ length: 40 }, (_, i) => generateSchedule(`V${i}`, "engineer").map((f) => f.id).join(",")));
    expect(combos.size).toBeGreaterThan(30);
  });

  it("sementes legíveis, normalizadas e do dia", () => {
    expect(newSeed(mulberry32(1))).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    expect(normalizeSeed(" abc-12 ç!x ")).toBe("ABC-12X");
    expect(dailySeed(new Date(2026, 10, 6))).toBe("DIA-20261106");
  });
});

describe("pontuação e recordes", () => {
  it("vitória rende medalha; derrota não", () => {
    const won = computeScore(runBot(trainingMission(), { policy: "smart", reactionS: 4 }));
    expect(won.medal).not.toBeNull();
    expect(won.total).toBeGreaterThan(400);
    const lost = computeScore(runIdle(trainingMission()));
    expect(lost.medal).toBeNull();
    expect(lost.total).toBeLessThan(won.total);
  });

  it("aplica o multiplicador da dificuldade", () => {
    const end = runBot({ kind: "random", seed: "MULT", difficulty: "commander" }, { policy: "smart", reactionS: 4 });
    const sc = computeScore(end);
    expect(sc.multiplier).toBe(DIFFICULTIES.commander.scoreMultiplier);
    expect(sc.total).toBe(Math.round(sc.base * sc.multiplier));
  });

  it("guarda o melhor resultado, partidas e vitórias", () => {
    const good = runBot(trainingMission(), { policy: "smart", reactionS: 4 });
    const bad = runIdle(trainingMission());
    let r = applyResult({}, bad);
    expect(r.isNewBest).toBe(true);
    r = applyResult(r.records, good);
    expect(r.isNewBest).toBe(true);
    r = applyResult(r.records, bad);
    expect(r.isNewBest).toBe(false);
    expect(r.entry).toMatchObject({ plays: 3, wins: 1, best: computeScore(good).total, medal: computeScore(good).medal });
  });

  it("recordes separados por tipo de missão", () => {
    expect(recordKey(trainingMission())).toBe("training");
    expect(recordKey({ kind: "random", seed: "A", difficulty: "engineer" })).toBe(recordKey({ kind: "random", seed: "B", difficulty: "engineer" }));
    expect(recordKey({ kind: "daily", seed: "DIA-1", difficulty: "engineer" })).not.toBe(recordKey({ kind: "daily", seed: "DIA-2", difficulty: "engineer" }));
  });
});

describe("sinais de apresentação", () => {
  it("detecta aviso, falha, reparo e desfecho", () => {
    const a = quiet();
    const b = activate(a, "generator");
    expect(cuesBetween(a, b)).toContainEqual({ kind: "failure", failureId: "generator" });
    const ended = { ...b, outcome: { result: "won" as const, at: 600 } };
    expect(cuesBetween(b, ended).map((c) => c.kind)).toContain("won");
    expect(cuesBetween(createInitialState(), createInitialState())).toEqual([]);
  });
});
