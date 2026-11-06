/**
 * Ponte entre a simulação pura e o React. Mantém o estado, o relógio, o laço de quadros
 * e o salvamento local. Componentes leem via useSyncExternalStore.
 */
import { clampSpeed, createClock, pause, resume, speedFromSearch, tickClock, type ClockState } from "@/sim/clock";
import {
  abortRepair,
  beginMission,
  computeFlows,
  createInitialState,
  setAllocation,
  startRepair,
  step,
} from "@/sim/engine";
import { clearSave, loadGame, memoryStorage, saveGame, type KeyValueStorage } from "@/sim/persistence";
import type { FailureId, Flows, RepairOptionId, SimState, SystemId } from "@/sim/types";

export interface GameSnapshot {
  hydrated: boolean;
  sim: SimState;
  flows: Flows;
  clock: ClockState;
  /** Verdadeiro quando a missão foi retomada de um salvamento nesta visita. */
  resumedFromSave: boolean;
}

type Listener = () => void;

function makeSnapshot(sim: SimState, clock: ClockState, hydrated: boolean, resumedFromSave: boolean): GameSnapshot {
  return { hydrated, sim, flows: computeFlows(sim), clock, resumedFromSave };
}

const initial = createInitialState();
export const SERVER_SNAPSHOT: GameSnapshot = makeSnapshot(initial, createClock(), false, false);

export class GameStore {
  private sim: SimState = initial;
  private clock: ClockState = createClock();
  private resumedFromSave = false;
  private hydrated = false;
  private snapshot: GameSnapshot = SERVER_SNAPSHOT;
  private listeners = new Set<Listener>();
  private storage: KeyValueStorage = memoryStorage();
  private raf = 0;
  private lastFrame = 0;
  private teardown: (() => void) | null = null;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.mount();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.unmount();
    };
  };

  getSnapshot = () => this.snapshot;

  getServerSnapshot = () => SERVER_SNAPSHOT;

  private emit(save = true) {
    this.snapshot = makeSnapshot(this.sim, this.clock, this.hydrated, this.resumedFromSave);
    if (save && this.hydrated) saveGame(this.storage, this.sim);
    for (const l of this.listeners) l();
  }

  private mount() {
    if (typeof window === "undefined") return;
    try {
      this.storage = window.localStorage;
    } catch {
      this.storage = memoryStorage();
    }
    const speed = speedFromSearch(window.location.search);
    if (!this.hydrated) {
      const saved = loadGame(this.storage);
      if (saved) {
        this.sim = saved;
        this.resumedFromSave = saved.phase === "active";
      }
      // Ao carregar, a missão sempre começa em pausa.
      this.clock = createClock(speed, true);
      this.hydrated = true;
    } else {
      this.clock = { ...pause(this.clock), speed: clampSpeed(speed) };
    }

    const onVisibility = () => {
      if (document.visibilityState === "hidden") this.pause();
    };
    const onPageHide = () => saveGame(this.storage, this.sim);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    this.teardown = () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };

    this.lastFrame = performance.now();
    const frame = (now: number) => {
      const delta = now - this.lastFrame;
      this.lastFrame = now;
      this.onFrame(delta);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    this.emit(false);
  }

  private unmount() {
    cancelAnimationFrame(this.raf);
    this.teardown?.();
    this.teardown = null;
  }

  private onFrame(deltaMs: number) {
    if (this.sim.phase !== "active") return;
    const { clock, steps } = tickClock(this.clock, deltaMs);
    this.clock = clock;
    if (steps === 0) return;
    let s = this.sim;
    for (let i = 0; i < steps && s.phase === "active"; i++) s = step(s);
    this.sim = s;
    if (s.phase === "ended") this.clock = pause(this.clock);
    this.emit();
  }

  // ———————————————————— ações

  begin() {
    this.sim = beginMission(this.sim);
    this.clock = resume(this.clock);
    this.resumedFromSave = false;
    this.emit();
  }

  pause() {
    if (this.clock.paused) return;
    this.clock = pause(this.clock);
    this.emit();
  }

  resume() {
    if (this.sim.phase !== "active") return;
    this.clock = resume(this.clock);
    this.resumedFromSave = false;
    this.emit(false);
  }

  togglePause() {
    if (this.clock.paused) this.resume();
    else this.pause();
  }

  restart() {
    clearSave(this.storage);
    this.sim = createInitialState();
    this.clock = createClock(this.clock.speed, true);
    this.resumedFromSave = false;
    this.emit();
  }

  setAllocation(system: SystemId, kw: number) {
    this.sim = setAllocation(this.sim, system, kw);
    this.emit();
  }

  startRepair(failure: FailureId, option: RepairOptionId) {
    this.sim = startRepair(this.sim, failure, option);
    this.emit();
  }

  abortRepair() {
    this.sim = abortRepair(this.sim);
    this.emit();
  }
}

let store: GameStore | null = null;

export function getStore(): GameStore {
  if (!store) store = new GameStore();
  return store;
}
