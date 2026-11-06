import { describe, expect, it } from "vitest";
import { SAVE_KEY } from "@/sim/config";
import { createClock, MAX_FRAME_MS, pause, resume, speedFromSearch, tickClock } from "@/sim/clock";
import { advance, computeModifiers, createInitialState, setAllocation, startRepair, step, beginMission } from "@/sim/engine";
import { runIdle } from "@/sim/bot";
import { clearSave, deserialize, loadGame, memoryStorage, saveGame, serialize } from "@/sim/persistence";
import { trainingMission } from "@/sim/random";

describe("relógio de jogo: pausa e retomada", () => {
  it("em pausa não gera passos", () => {
    expect(tickClock(createClock(1, true), 5000).steps).toBe(0);
  });

  it("conta só o tempo ativo e acumula frações", () => {
    let c = resume(createClock(1, true));
    let total = 0;
    for (let i = 0; i < 60; i++) {
      const r = tickClock(c, 50);
      c = r.clock;
      total += r.steps;
    }
    expect(total).toBe(3);
    c = pause(c);
    for (let i = 0; i < 100; i++) total += tickClock(c, 50).steps;
    expect(total).toBe(3);
    c = resume(c);
    for (let i = 0; i < 20; i++) {
      const r = tickClock(c, 50);
      c = r.clock;
      total += r.steps;
    }
    expect(total).toBe(4);
  });

  it("limita quadros longos (aba em segundo plano)", () => {
    expect(tickClock(resume(createClock(1)), 60_000).steps).toBe(Math.floor(MAX_FRAME_MS / 1000));
  });

  it("relógio acelerado multiplica o tempo de jogo", () => {
    expect(tickClock(resume(createClock(20)), 200).steps).toBe(4);
    expect(speedFromSearch("?velocidade=30")).toBe(30);
    expect(speedFromSearch("?speed=abc")).toBe(1);
  });
});

describe("persistência local", () => {
  it("salva e recupera uma missão sorteada no meio de um reparo, com consequências preservadas", () => {
    const storage = memoryStorage();
    let s = beginMission(createInitialState({ kind: "random", seed: "PERSIST", difficulty: "engineer" }));
    s = setAllocation(s, "cooling", 5);
    const first = s.failures[0];
    s = advance(s, first.at - s.t);
    s = startRepair(s, first.id, "quick");
    s = advance(s, 60);
    const second = s.failures[1];
    s = advance(s, Math.max(0, second.at - s.t));
    s = startRepair(s, second.id, "full");
    s = advance(s, 5);
    saveGame(storage, s);
    expect(storage.data.has(SAVE_KEY)).toBe(true);

    const loaded = loadGame(storage)!;
    expect(loaded).toEqual(s);
    expect(loaded.mission).toEqual({ kind: "random", seed: "PERSIST", difficulty: "engineer" });
    expect(computeModifiers(loaded)).toEqual(computeModifiers(s));
    expect(JSON.stringify(advance(loaded, 200))).toBe(JSON.stringify(advance(s, 200)));
  });

  it("um jogo concluído continua concluído após recarregar", () => {
    const storage = memoryStorage();
    const end = runIdle(trainingMission());
    saveGame(storage, end);
    const loaded = loadGame(storage)!;
    expect(loaded.outcome).toEqual(end.outcome);
    expect(step(loaded)).toBe(loaded);
  });

  it("ignora salvamentos corrompidos ou de outra versão", () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize("{nada")).toBeNull();
    expect(deserialize(JSON.stringify({ v: 1, state: {} }))).toBeNull();
    const s = createInitialState();
    const tampered = JSON.parse(serialize(s));
    tampered.state.failures[0].id = "dragao";
    expect(deserialize(JSON.stringify(tampered))).toBeNull();
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it("reiniciar apaga o salvamento", () => {
    const storage = memoryStorage();
    saveGame(storage, createInitialState());
    clearSave(storage);
    expect(loadGame(storage)).toBeNull();
  });

  it("não quebra quando o armazenamento falha", () => {
    const boom = () => {
      throw new Error("bloqueado");
    };
    const broken = { getItem: boom, setItem: boom, removeItem: boom };
    expect(() => saveGame(broken, createInitialState())).not.toThrow();
    expect(loadGame(broken)).toBeNull();
    expect(() => clearSave(broken)).not.toThrow();
  });
});
