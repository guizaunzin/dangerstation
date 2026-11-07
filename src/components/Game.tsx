"use client";

import { useEffect, useSyncExternalStore } from "react";
import { BALANCE, DIFFICULTIES, MODULE_NAME } from "@/sim/config";
import { awaitingDecision, formatClock, isWaitingDecision, remainingS } from "@/sim/engine";
import { activeAlerts } from "@/sim/insights";
import { newSeed } from "@/sim/random";
import { AlertsPanel, AlertStrip } from "./AlertsPanel";
import { DecisionPanel } from "./DecisionPanel";
import { getStore, SERVER_SNAPSHOT } from "./gameStore";
import { IconCheck, IconMute, IconPause, IconPlay, IconVolume } from "./Icons";
import { MissionSelect } from "./MissionSelect";
import { ModuleArt } from "./ModuleArt";
import { IntroOverlay, LogPanel, PauseOverlay, ReportOverlay } from "./Overlays";
import { RepairsPanel } from "./RepairsPanel";
import { RescueTimeline } from "./RescueTimeline";
import { EnergyCard, HeatCard, OxygenCard } from "./SystemCards";

export default function Game() {
  const store = getStore();
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER_SNAPSHOT);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if ((e.key === " " || e.key.toLowerCase() === "p") && store.getSnapshot().sim?.phase === "active") {
        if (target?.tagName === "BUTTON" && e.key === " ") return; // espaço ativa o botão focado
        e.preventDefault();
        store.togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  if (!snap.hydrated) {
    return (
      <main className="boot" aria-busy="true">
        <p className="mono">Inicializando console do {MODULE_NAME}…</p>
      </main>
    );
  }

  const { sim, flows, clock } = snap;
  if (!sim || !flows) {
    return (
      <MissionSelect records={snap.records} prefs={snap.prefs} onStart={(spec) => store.newMission(spec)} onToggleSound={() => store.toggleSound()} />
    );
  }

  const waitingDecision = isWaitingDecision(sim);
  const running = sim.phase === "active" && !clock.paused && !waitingDecision;
  const alerts = activeAlerts(sim, flows);
  const criticalCount = alerts.filter((a) => a.level === "critical").length;
  const showPause = sim.phase === "active" && clock.paused;
  const controlsDisabled = sim.phase !== "active";
  const decisions = sim.phase === "active" && !clock.paused ? awaitingDecision(sim) : [];
  const decision = decisions[0];
  const missionLabel =
    sim.mission.kind === "training"
      ? "Treinamento"
      : `${sim.mission.kind === "daily" ? "Desafio do dia" : "Sorteada"} · ${DIFFICULTIES[sim.mission.difficulty].label}`;
  const alertActions = { onDecide: (id: Parameters<typeof store.reopen>[0]) => store.reopen(id), onCancelQueue: () => store.cancelQueue() };

  return (
    <div className={`console${criticalCount ? " has-critical" : ""}${decision && !waitingDecision ? " has-dock" : ""}`}>
      <header className="topbar">
        <div className="topbar-mission">
          <span className="mission-name">{MODULE_NAME}</span>
          <span className="mission-kind">{missionLabel}</span>
          <span className={`run-state ${running ? "is-running" : "is-paused"}`}>
            {sim.phase === "ended" ? (
              <>
                <IconCheck /> ENCERRADA
              </>
            ) : running ? (
              <>
                <IconPlay /> EM CURSO
              </>
            ) : waitingDecision ? (
              <>
                <IconPause /> AGUARDANDO DECISÃO
              </>
            ) : (
              <>
                <IconPause /> PAUSA
              </>
            )}
          </span>
          {criticalCount ? <span className="critical-chip">{criticalCount} crítico(s)</span> : null}
          {clock.speed !== 1 ? <span className="speed-badge">Relógio acelerado ×{clock.speed}</span> : null}
        </div>
        <div className="rescue" aria-live="off">
          <span className="rescue-label">Resgate em</span>
          <span className="rescue-time mono">{formatClock(remainingS(sim))}</span>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => store.toggleSound()}
            aria-label={snap.prefs.sound ? "Desligar som" : "Ligar som"}
            aria-pressed={snap.prefs.sound}
          >
            {snap.prefs.sound ? <IconVolume /> : <IconMute />}
          </button>
          <button
            type="button"
            className="btn btn-pause"
            onClick={() => store.togglePause()}
            disabled={sim.phase !== "active"}
            aria-label={clock.paused ? "Retomar missão" : "Pausar missão"}
          >
            {clock.paused ? <IconPlay /> : <IconPause />}
            <span>{clock.paused ? "Retomar" : "Pausar"}</span>
          </button>
        </div>
        <AlertStrip alerts={alerts} {...alertActions} />
        <RescueTimeline state={sim} />
      </header>

      <main className="layout">
        <div className="col col-left">
          {decision ? (
            <DecisionPanel
              key={decision.id}
              state={sim}
              flows={flows}
              failure={decision}
              pausing={waitingDecision}
              moreWaiting={decisions.length - 1}
              onChoose={(option, mode) => store.decide(decision.id, option, mode)}
              onIgnore={() => store.ignore(decision.id)}
            />
          ) : null}
          <AlertsPanel alerts={alerts} {...alertActions} />
          <section className="panel art-panel" aria-label="Vista externa do módulo">
            <ModuleArt state={sim} flows={flows} />
          </section>
        </div>
        <div className="col col-center">
          <HeatCard state={sim} flows={flows} disabled={controlsDisabled} onSet={(id, kw) => store.setAllocation(id, kw)} />
          <OxygenCard state={sim} flows={flows} disabled={controlsDisabled} onSet={(id, kw) => store.setAllocation(id, kw)} />
          <EnergyCard state={sim} flows={flows} />
        </div>
        <div className="col col-right">
          <RepairsPanel
            state={sim}
            flows={flows}
            disabled={controlsDisabled}
            onSet={(id, kw) => store.setAllocation(id, kw)}
            onDecide={(id) => store.reopen(id)}
            onAbort={() => store.abortRepair()}
            onCancelQueue={() => store.cancelQueue()}
          />
          <LogPanel log={sim.log} />
        </div>
      </main>

      <footer className="footer">
        <span>
          Estação Espacial em Perigo · V2 · semente <span className="mono">{sim.mission.seed}</span>
        </span>
        <span>Espaço ou P: pausar/retomar · missão de {formatClock(BALANCE.missionDurationS)}</span>
      </footer>

      {sim.phase === "intro" ? <IntroOverlay state={sim} onStart={() => store.begin()} onMenu={() => store.toMenu()} /> : null}
      {showPause ? (
        <PauseOverlay
          state={sim}
          resumedFromSave={snap.resumedFromSave}
          onResume={() => store.resume()}
          onRestart={() => store.restart()}
          onMenu={() => store.toMenu()}
        />
      ) : null}
      {sim.phase === "ended" ? (
        <ReportOverlay
          state={sim}
          result={snap.lastResult}
          onRestart={() => store.restart()}
          onNewSeed={() => store.newMission({ ...sim.mission, seed: newSeed() })}
          onMenu={() => store.toMenu()}
        />
      ) : null}
    </div>
  );
}
