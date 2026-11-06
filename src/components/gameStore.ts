/**
 * Ponte entre a simulação pura e o React. Mantém o estado, o relógio, o laço de quadros,
 * o salvamento local, os recordes e os sons. Componentes leem via useSyncExternalStore.
 */
import { PREFS_KEY } from "@/sim/config";
import { clampSpeed, createClock, pause, resume, speedFromSearch, tickClock, type ClockState } from "@/sim/clock";
import { abortRepair, beginMission, computeFlows, createInitialState, setAllocation, startRepair, step } from "@/sim/engine";
import { cuesBetween } from "@/sim/events";
import { clearSave, loadGame, memoryStorage, saveGame, type KeyValueStorage } from "@/sim/persistence";
import { applyResult, loadRecords, saveRecords, type RecordResult, type Records } from "@/sim/scoring";
import type { FailureId, Flows, MissionSpec, RepairOptionId, SimState, SystemId } from "@/sim/types";
import { SoundBank } from "./sound";

export interface Prefs {
  sound: boolean;
  trainingDone: boolean;
}

const DEFAULT_PREFS: Prefs = { sound: true, trainingDone: false };

export interface GameSnapshot {
  hydrated: boolean;
  /** Missão em andamento ou encerrada; null mostra o menu. */
  sim: SimState | null;
  flows: Flows | null;
  clock: ClockState;
  /** Verdadeiro quando a missão foi retomada de um salvamento nesta visita. */
  resumedFromSave: boolean;
  records: Records;
  prefs: Prefs;
  /** Resultado registrado ao fim da missão atual. */
  lastResult: RecordResult | null;
}

type Listener = () => void;

export const SERVER_SNAPSHOT: GameSnapshot = {
  hydrated: false,
  sim: null,
  flows: null,
  clock: createClock(),
  resumedFromSave: false,
  records: {},
  prefs: DEFAULT_PREFS,
  lastResult: null,
};

function loadPrefs(storage: KeyValueStorage): Prefs {
  try {
    const raw = storage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export class GameStore {
  private sim: SimState | null = null;
  private clock: ClockState = createClock();
  private resumedFromSave = false;
  private hydrated = false;
  private records: Records = {};
  private prefs: Prefs = DEFAULT_PREFS;
  private lastResult: RecordResult | null = null;
  private snapshot: GameSnapshot = SERVER_SNAPSHOT;
  private listeners = new Set<Listener>();
  private storage: KeyValueStorage = memoryStorage();
  private sound = new SoundBank();
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
    this.snapshot = {
      hydrated: this.hydrated,
      sim: this.sim,
      flows: this.sim ? computeFlows(this.sim) : null,
      clock: this.clock,
      resumedFromSave: this.resumedFromSave,
      records: this.records,
      prefs: this.prefs,
      lastResult: this.lastResult,
    };
    if (save && this.hydrated) {
      if (this.sim) saveGame(this.storage, this.sim);
      else clearSave(this.storage);
    }
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
      this.records = loadRecords(this.storage);
      this.prefs = loadPrefs(this.storage);
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
    const onPageHide = () => {
      if (this.sim) saveGame(this.storage, this.sim);
    };
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
    if (!this.sim || this.sim.phase !== "active") return;
    const { clock, steps } = tickClock(this.clock, deltaMs);
    this.clock = clock;
    if (steps === 0) return;
    let s = this.sim;
    for (let i = 0; i < steps && s.phase === "active"; i++) {
      const next = step(s);
      if (this.prefs.sound) for (const cue of cuesBetween(s, next)) this.sound.play(cue.kind);
      s = next;
    }
    this.sim = s;
    if (s.phase === "ended") this.finish();
    this.emit();
  }

  private finish() {
    if (!this.sim) return;
    this.clock = pause(this.clock);
    const result = applyResult(this.records, this.sim);
    this.records = result.records;
    this.lastResult = result;
    saveRecords(this.storage, this.records);
    if (this.sim.mission.kind === "training" && !this.prefs.trainingDone) this.setPrefs({ trainingDone: true });
  }

  private setPrefs(patch: Partial<Prefs>) {
    this.prefs = { ...this.prefs, ...patch };
    try {
      this.storage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      // ignorado
    }
  }

  // ———————————————————— ações

  /** Prepara uma missão nova e mostra a abertura/briefing. */
  newMission(spec: MissionSpec) {
    this.sound.unlock();
    this.sim = createInitialState(spec);
    this.clock = createClock(this.clock.speed, true);
    this.resumedFromSave = false;
    this.lastResult = null;
    this.emit();
  }

  begin() {
    if (!this.sim) return;
    this.sound.unlock();
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
    if (!this.sim || this.sim.phase !== "active") return;
    this.sound.unlock();
    this.clock = resume(this.clock);
    this.resumedFromSave = false;
    this.emit(false);
  }

  togglePause() {
    if (this.clock.paused) this.resume();
    else this.pause();
  }

  /** Recomeça a mesma missão (mesma semente e dificuldade). */
  restart() {
    if (!this.sim) return;
    this.newMission(this.sim.mission);
  }

  /** Abandona a missão atual e volta ao menu. */
  toMenu() {
    this.sim = null;
    this.clock = pause(this.clock);
    this.lastResult = null;
    this.resumedFromSave = false;
    this.emit();
  }

  toggleSound() {
    this.setPrefs({ sound: !this.prefs.sound });
    if (this.prefs.sound) {
      this.sound.unlock();
      this.sound.play("resolved");
    }
    this.emit(false);
  }

  setAllocation(system: SystemId, kw: number) {
    if (!this.sim) return;
    this.sim = setAllocation(this.sim, system, kw);
    this.emit();
  }

  startRepair(failure: FailureId, option: RepairOptionId) {
    if (!this.sim) return;
    this.sim = startRepair(this.sim, failure, option);
    this.emit();
  }

  abortRepair() {
    if (!this.sim) return;
    this.sim = abortRepair(this.sim);
    this.emit();
  }
}

let store: GameStore | null = null;

export function getStore(): GameStore {
  if (!store) store = new GameStore();
  return store;
}
