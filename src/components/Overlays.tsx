"use client";

import { useState } from "react";
import { BALANCE, SCENARIO } from "@/sim/config";
import { formatClock } from "@/sim/engine";
import { buildReport } from "@/sim/insights";
import type { LogEntry, LogKind, SimState } from "@/sim/types";
import {
  IconAlert,
  IconBattery,
  IconBolt,
  IconCheck,
  IconCritical,
  IconHeat,
  IconInfo,
  IconOxygen,
  IconPlay,
  IconRestart,
  IconSnow,
  IconWrench,
} from "./Icons";

const KIND: Record<LogKind, { label: string; Icon: typeof IconInfo }> = {
  info: { label: "INFO", Icon: IconInfo },
  warn: { label: "AVISO", Icon: IconAlert },
  alert: { label: "ALARME", Icon: IconCritical },
  decision: { label: "DECISÃO", Icon: IconBolt },
  success: { label: "OK", Icon: IconCheck },
};

export function LogPanel({ log }: { log: LogEntry[] }) {
  const recent = [...log].reverse().slice(0, 14);
  return (
    <section className="panel log" aria-labelledby="log-title">
      <h2 id="log-title" className="panel-title">
        Registro de incidentes e decisões
      </h2>
      {recent.length === 0 ? <p className="empty">Sem registros ainda.</p> : null}
      <ol className="log-list">
        {recent.map((e) => {
          const k = KIND[e.kind];
          return (
            <li key={e.id} className={`log-entry log-${e.kind}`}>
              <span className="log-time mono">{formatClock(e.t)}</span>
              <span className="log-kind">
                <k.Icon /> {k.label}
              </span>
              <span className="log-text">{e.text}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const INTRO_STEPS = [
  {
    title: "Módulo Kestrel em perigo",
    body: (
      <>
        <p>
          Você controla um módulo orbital danificado. O resgate chega em{" "}
          <strong>{formatClock(BALANCE.missionDurationS)}</strong> de jogo ativo. Mantenha o módulo habitável até lá.
        </p>
        <p>
          A pergunta é sempre a mesma: <strong>qual sistema recebe energia agora e qual pode esperar?</strong>
        </p>
      </>
    ),
  },
  {
    title: "Três recursos, um gerador",
    body: (
      <ul className="intro-list">
        <li>
          <IconBattery /> <strong>Energia:</strong> o gerador tem {BALANCE.generator.nominalKw} kW. Se o pedido passar disso, a
          bateria cobre a diferença enquanto durar.
        </li>
        <li>
          <IconHeat /> <strong>Calor:</strong> equipamentos e reparos esquentam o módulo. Acima de {BALANCE.generator.derateStartC}{" "}
          °C o gerador rende menos, e isso pode virar uma cascata.
        </li>
        <li>
          <IconOxygen /> <strong>Oxigênio:</strong> a tripulação consome sem parar. O suporte de vida repõe quando recebe potência.
        </li>
        <li>
          <IconCritical /> Calor acima de {BALANCE.heat.criticalC} °C ou oxigênio abaixo de {BALANCE.oxygen.criticalPct}% por{" "}
          {BALANCE.critical.graceS} s seguidos: módulo perdido. Um contador mostra quanto tempo resta para reagir.
        </li>
      </ul>
    ),
  },
  {
    title: "Falhas e reparos",
    body: (
      <ul className="intro-list">
        <li>
          <IconAlert /> Três falhas vão acontecer. Os sensores avisam 20 s antes.
        </li>
        <li>
          <IconWrench /> Cada falha tem uma <strong>resposta rápida</strong> (barata, com efeito residual) e um{" "}
          <strong>reparo completo</strong> (caro e demorado, sem resíduo). Uma equipe, um reparo por vez.
        </li>
        <li>
          <IconCheck /> A escolha vale até o resgate. O progresso fica salvo neste navegador; ao voltar, a missão retoma em pausa.
        </li>
      </ul>
    ),
  },
  {
    title: "Seu primeiro ajuste",
    body: (
      <>
        <p>
          <IconSnow /> O módulo começa com só <strong>2 kW na refrigeração</strong> e o calor já está subindo.
        </p>
        <p>
          Assim que a missão começar, toque em <strong>+</strong> na linha <strong>Refrigeração</strong> até chegar a{" "}
          <strong>4 kW</strong>. O gerador tem folga para isso.
        </p>
        <p className="muted">Pause a qualquer momento com o botão Pausar ou a barra de espaço.</p>
      </>
    ),
  },
];

export function IntroOverlay({ onStart }: { onStart: () => void }) {
  const [i, setI] = useState(0);
  const stepInfo = INTRO_STEPS[i];
  const last = i === INTRO_STEPS.length - 1;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="modal intro">
        <p className="kicker">
          {SCENARIO.name} · {i + 1}/{INTRO_STEPS.length}
        </p>
        <h2 id="intro-title">{stepInfo.title}</h2>
        <div className="intro-body">{stepInfo.body}</div>
        <div className="dots" aria-hidden>
          {INTRO_STEPS.map((_, k) => (
            <span key={k} className={k === i ? "dot on" : "dot"} />
          ))}
        </div>
        <div className="modal-actions">
          {i > 0 ? (
            <button type="button" className="btn" onClick={() => setI(i - 1)}>
              Voltar
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={onStart}>
              Pular abertura
            </button>
          )}
          {last ? (
            <button type="button" className="btn btn-primary" onClick={onStart} autoFocus>
              <IconPlay /> Iniciar missão
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setI(i + 1)} autoFocus>
              Próximo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RestartButton({
  onRestart,
  label = "Reiniciar missão",
  confirm = true,
}: {
  onRestart: () => void;
  label?: string;
  confirm?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className={confirm ? "btn" : "btn btn-primary"} onClick={() => (confirm ? setConfirming(true) : onRestart())}>
        <IconRestart /> {label}
      </button>
    );
  }
  return (
    <div className="inline-confirm">
      <span>Apagar o progresso salvo e começar do zero?</span>
      <button type="button" className="btn btn-danger" onClick={onRestart}>
        Sim, reiniciar
      </button>
      <button type="button" className="btn" onClick={() => setConfirming(false)}>
        Cancelar
      </button>
    </div>
  );
}

export function PauseOverlay({
  state,
  resumedFromSave,
  onResume,
  onRestart,
}: {
  state: SimState;
  resumedFromSave: boolean;
  onResume: () => void;
  onRestart: () => void;
}) {
  const remaining = BALANCE.missionDurationS - state.t;
  const resolved = state.failures.filter((f) => f.status === "resolved").length;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div className="modal">
        <p className="kicker">{resumedFromSave ? "Salvamento local carregado" : "Relógio parado"}</p>
        <h2 id="pause-title">Missão em pausa</h2>
        {resumedFromSave ? (
          <p>
            Missão retomada de onde parou. Reparos, falhas e consequências foram preservados. O relógio só volta a correr quando você
            retomar.
          </p>
        ) : (
          <p>O tempo de jogo não corre enquanto a missão está em pausa.</p>
        )}
        <p className="mono pause-stats">
          Resgate em {formatClock(remaining)} · falhas resolvidas {resolved}/{state.failures.length}
          {state.repair ? " · reparo em andamento" : ""}
        </p>
        <div className="modal-actions">
          <RestartButton onRestart={onRestart} />
          <button type="button" className="btn btn-primary" onClick={onResume} autoFocus>
            <IconPlay /> Retomar
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReportOverlay({ state, onRestart }: { state: SimState; onRestart: () => void }) {
  const report = buildReport(state);
  if (!report) return null;
  const won = report.result === "won";
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className={`modal report ${won ? "is-won" : "is-lost"}`}>
        <p className="kicker">Relatório final · {SCENARIO.moduleName}</p>
        <h2 id="report-title">
          {won ? <IconCheck /> : <IconCritical />} {report.title}
        </h2>
        <p className="report-cause">
          <strong>{won ? "Estado no resgate:" : "Causa da derrota:"}</strong> {report.cause}
        </p>
        <dl className="report-lines">
          {report.lines.map((l) => (
            <div key={l.label}>
              <dt>{l.label}</dt>
              <dd className="mono">{l.value}</dd>
            </div>
          ))}
        </dl>
        <h3>Decisões</h3>
        <ul className="report-decisions">
          {report.decisions.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
        <div className="modal-actions">
          <RestartButton onRestart={onRestart} label="Jogar de novo" confirm={false} />
        </div>
      </div>
    </div>
  );
}
