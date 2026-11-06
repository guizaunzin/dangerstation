"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BALANCE, DIFFICULTIES, MODULE_NAME } from "@/sim/config";
import { formatClock, remainingS } from "@/sim/engine";
import { activeAlerts, type AlertLevel } from "@/sim/insights";
import { newSeed } from "@/sim/random";
import type { FailureId, RepairOptionId } from "@/sim/types";
import { getStore, SERVER_SNAPSHOT } from "./gameStore";
import { IconAlert, IconCheck, IconCritical, IconInfo, IconMute, IconPause, IconPlay, IconVolume } from "./Icons";
import { MissionSelect } from "./MissionSelect";
import { ModuleArt } from "./ModuleArt";
import { IntroOverlay, LogPanel, PauseOverlay, ReportOverlay } from "./Overlays";
import { PowerPanel } from "./PowerPanel";
import { RepairConfirmSheet, RepairsPanel } from "./RepairsPanel";
import { RescueTimeline } from "./RescueTimeline";
import { SystemsPanel } from "./SystemsPanel";

const ALERT_ICON: Record<AlertLevel, typeof IconInfo> = {
  critical: IconCritical,
  warning: IconAlert,
  info: IconInfo,
};
const ALERT_LABEL: Record<AlertLevel, string> = { critical: "CRÍTICO", warning: "ALERTA", info: "AVISO" };

export default function Game() {
  const store = getStore();
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER_SNAPSHOT);
  const [pending, setPending] = useState<{ failure: FailureId; option: RepairOptionId } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "Escape") setPending(null);
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
      <MissionSelect
        records={snap.records}
        prefs={snap.prefs}
        onStart={(spec) => store.newMission(spec)}
        onToggleSound={() => store.toggleSound()}
      />
    );
  }

  const running = sim.phase === "active" && !clock.paused;
  const alerts = activeAlerts(sim, flows);
  const remaining = remainingS(sim);
  const hasCritical = alerts.some((a) => a.level === "critical");
  const showPause = sim.phase === "active" && clock.paused;
  const controlsDisabled = sim.phase !== "active";
  const missionLabel =
    sim.mission.kind === "training" ? "Treinamento" : `${sim.mission.kind === "daily" ? "Desafio do dia" : "Sorteada"} · ${DIFFICULTIES[sim.mission.difficulty].label}`;

  return (
    <div className={`console${hasCritical ? " has-critical" : ""}`}>
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
            ) : (
              <>
                <IconPause /> PAUSA
              </>
            )}
          </span>
          {clock.speed !== 1 ? <span className="speed-badge">Relógio acelerado ×{clock.speed}</span> : null}
        </div>
        <div className="rescue" aria-live="off">
          <span className="rescue-label">Resgate em</span>
          <span className="rescue-time mono">{formatClock(remaining)}</span>
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
        <RescueTimeline state={sim} />
      </header>

      <section className="alerts" aria-label="Alertas ativos" aria-live="polite">
        {alerts.length === 0 ? (
          <p className="alert alert-ok">
            <IconCheck /> <span className="alert-level">NORMAL</span> Nenhum alarme ativo
          </p>
        ) : (
          alerts.map((a) => {
            const Icon = ALERT_ICON[a.level];
            return (
              <p key={a.id} className={`alert alert-${a.level}`}>
                <Icon /> <span className="alert-level">{ALERT_LABEL[a.level]}</span> {a.text}
              </p>
            );
          })
        )}
      </section>

      <main className="layout">
        <section className="panel art-panel" aria-label="Vista externa do módulo">
          <ModuleArt state={sim} flows={flows} />
        </section>
        <SystemsPanel state={sim} flows={flows} />
        <PowerPanel state={sim} flows={flows} disabled={controlsDisabled} onSet={(id, kw) => store.setAllocation(id, kw)} />
        <RepairsPanel
          state={sim}
          flows={flows}
          disabled={controlsDisabled}
          onChoose={(failure, option) => setPending({ failure, option })}
          onAbort={() => store.abortRepair()}
        />
        <LogPanel log={sim.log} />
      </main>

      <footer className="footer">
        <span>
          Estação Espacial em Perigo · V2 · semente <span className="mono">{sim.mission.seed}</span>
        </span>
        <span>Espaço ou P: pausar/retomar · missão de {formatClock(BALANCE.missionDurationS)}</span>
      </footer>

      {pending && sim.phase === "active" ? (
        <RepairConfirmSheet
          state={sim}
          failure={pending.failure}
          option={pending.option}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            store.startRepair(pending.failure, pending.option);
            setPending(null);
          }}
        />
      ) : null}
      {sim.phase === "intro" ? <IntroOverlay state={sim} onStart={() => store.begin()} onMenu={() => store.toMenu()} /> : null}
      {showPause && !pending ? (
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
