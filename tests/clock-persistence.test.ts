import { describe, expect, it } from "vitest";
import { SAVE_KEY } from "@/sim/config";
import { createClock, MAX_FRAME_MS, pause, resume, speedFromSearch, tickClock } from "@/sim/clock";
import { advance, beginMission, computeModifiers, createInitialState, setAllocation, startRepair, step } from "@/sim/engine";
import { clearSave, deserialize, loadGame, memoryStorage, saveGame, serialize } from "@/sim/persistence";
import { ROUTES, runRoute } from "@/sim/strategies";

describe("relógio de jogo: pausa e retomada", () => {
  it("em pausa não gera passos", () => {
    const c = createClock(1, true);
    expect(tickClock(c, 5000).steps).toBe(0);
  });

  it("conta só o tempo ativo e acumula frações", () => {
    let c = resume(createClock(1, true));
    let total = 0;
    for (let i = 0; i < 60; i++) {
      const r = tickClock(c, 50);
      c = r.clock;
      total += r.steps;
    }
    expect(total).toBe(3); // 60 × 50 ms = 3 s
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
    const c = resume(createClock(1));
    expect(tickClock(c, 60_000).steps).toBe(Math.floor(MAX_FRAME_MS / 1000));
  });

  it("relógio acelerado multiplica o tempo de jogo", () => {
    const c = resume(createClock(20));
    expect(tickClock(c, 200).steps).toBe(4);
    expect(speedFromSearch("?velocidade=30")).toBe(30);
    expect(speedFromSearch("?speed=abc")).toBe(1);
    expect(speedFromSearch("")).toBe(1);
  });
});

describe("persistência local", () => {
  it("salva e recupera o estado no meio de um reparo, com consequências preservadas", () => {
    const storage = memoryStorage();
    let s = beginMission(createInitialState());
    s = setAllocation(s, "cooling", 4);
    s = advance(s, 150);
    s = advance(startRepair(s, "generator", "quick"), 30); // resolvido com efeito residual
    s = advance(s, 330);
    s = startRepair(s, "cooling", "full");
    s = advance(s, 40); // reparo em andamento
    saveGame(storage, s);
    expect(storage.data.has(SAVE_KEY)).toBe(true);

    const loaded = loadGame(storage)!;
    expect(loaded).toEqual(s);
    expect(loaded.repair).toMatchObject({ failureId: "cooling", option: "full" });
    expect(loaded.failures[0]).toMatchObject({ status: "resolved", resolution: "quick" });
    expect(computeModifiers(loaded)).toEqual(computeModifiers(s));
    // continuar do estado carregado produz exatamente o mesmo futuro
    expect(JSON.stringify(advance(loaded, 300))).toBe(JSON.stringify(advance(s, 300)));
  });

  it("um jogo concluído continua concluído após recarregar", () => {
    const storage = memoryStorage();
    const end = runRoute(ROUTES.inaction);
    saveGame(storage, end);
    const loaded = loadGame(storage)!;
    expect(loaded.outcome).toEqual(end.outcome);
    expect(step(loaded)).toBe(loaded);
  });

  it("ignora salvamentos corrompidos ou de outra versão", () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize("{nada")).toBeNull();
    expect(deserialize(JSON.stringify({ v: 99, state: {} }))).toBeNull();
    const s = createInitialState();
    const tampered = JSON.parse(serialize(s));
    tampered.state.heatC = "quente";
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
    const broken = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("cheio");
      },
      removeItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(() => saveGame(broken, createInitialState())).not.toThrow();
    expect(loadGame(broken)).toBeNull();
    expect(() => clearSave(broken)).not.toThrow();
  });
});
