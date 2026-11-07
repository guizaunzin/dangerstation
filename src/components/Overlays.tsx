"use client";

import { useState } from "react";
import { BALANCE, DIFFICULTIES, MODULE_NAME } from "@/sim/config";
import { formatClock } from "@/sim/engine";
import { buildReport } from "@/sim/insights";
import { computeScore, type RecordResult } from "@/sim/scoring";
import type { LogEntry, LogKind, SimState } from "@/sim/types";
import { FailureIcon } from "./FailureIcon";
import {
  IconAlert,
  IconBattery,
  IconBolt,
  IconCheck,
  IconCritical,
  IconDice,
  IconHeat,
  IconInfo,
  IconMenu,
  IconOxygen,
  IconPlay,
  IconRestart,
  IconSnow,
  IconWrench,
} from "./Icons";
import { MedalBadge } from "./MissionSelect";

const KIND: Record<LogKind, { label: string; Icon: typeof IconInfo }> = {
  info: { label: "INFO", Icon: IconInfo },
  warn: { label: "AVISO", Icon: IconAlert },
  alert: { label: "ALARME", Icon: IconCritical },
  decision: { label: "DECISÃO", Icon: IconBolt },
  success: { label: "OK", Icon: IconCheck },
};

export function LogPanel({ log }: { log: LogEntry[] }) {
  const recent = [...log].reverse().slice(0, 16);
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

function missionTitle(state: SimState): string {
  const m = state.mission;
  if (m.kind === "training") return "Treinamento";
  if (m.kind === "daily") return `Desafio do dia · ${DIFFICULTIES[m.difficulty].label}`;
  return `Missão sorteada · ${DIFFICULTIES[m.difficulty].label}`;
}

const TRAINING_STEPS = [
  {
    title: "Módulo Kestrel em perigo",
    body: (
      <>
        <p>
          Você controla um módulo orbital danificado. A nave de resgate <strong>Aurora</strong> acopla em{" "}
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
          <IconBattery /> <strong>Energia:</strong> se o pedido passar da geração, a bateria cobre a diferença enquanto durar.
        </li>
        <li>
          <IconHeat /> <strong>Calor:</strong> equipamentos e reparos esquentam o módulo. Acima de {BALANCE.generator.derateStartC} °C o
          gerador rende menos, e isso pode virar uma cascata.
        </li>
        <li>
          <IconOxygen /> <strong>Oxigênio:</strong> a tripulação consome sem parar. O suporte de vida repõe quando recebe potência.
        </li>
        <li>
          <IconCritical /> Calor acima de {BALANCE.heat.criticalC} °C ou oxigênio abaixo de {BALANCE.oxygen.criticalPct}% por tempo
          demais: módulo perdido. Um contador mostra quanto tempo resta para reagir.
        </li>
      </ul>
    ),
  },
  {
    title: "Falhas e reparos",
    body: (
      <ul className="intro-list">
        <li>
          <IconAlert /> Os sensores avisam antes de cada falha. A linha do tempo no topo mostra a nave chegando e as falhas previstas.
        </li>
        <li>
          <IconWrench /> Quando uma falha chega, a decisão aparece na hora: <strong>resposta rápida</strong> (barata, com sequela),{" "}
          <strong>reparo completo</strong> (caro e demorado, sem sequela) ou <strong>ignorar por enquanto</strong>. No treinamento o
          relógio espera você decidir.
        </li>
        <li>
          <IconWrench /> Uma equipe, um reparo por vez e uma vaga na <strong>fila</strong>: com a equipe ocupada, o próximo reparo
          começa sozinho quando ela liberar.
        </li>
        <li>
          <IconCritical /> Falhas esperando reparo <strong>pioram</strong> com o tempo. Escolha a ordem com cuidado.
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
          Assim que a missão começar, toque em <strong>+</strong> na linha <strong>Refrigeração</strong> até chegar a <strong>4 kW</strong>.
        </p>
        <p className="muted">Pause a qualquer momento com o botão Pausar ou a barra de espaço.</p>
      </>
    ),
  },
];

export function IntroOverlay({ state, onStart, onMenu }: { state: SimState; onStart: () => void; onMenu: () => void }) {
  const [i, setI] = useState(0);
  if (state.mission.kind !== "training") {
    const d = DIFFICULTIES[state.mission.difficulty];
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="intro-title">
        <div className="modal intro">
          <p className="kicker">Briefing · semente {state.mission.seed}</p>
          <h2 id="intro-title">{missionTitle(state)}</h2>
          <ul className="intro-list">
            <li>
              <IconCritical /> <strong>{state.failures.length} falhas</strong> vão acontecer, em ordem e horários desconhecidos. Avisos com{" "}
              {d.warningLeadS} s de antecedência.
            </li>
            <li>
              <IconBolt /> Gerador de <strong>{String(d.generatorKw).replace(".", ",")} kW</strong>. Tolerância no nível crítico:{" "}
              <strong>{d.graceS} s</strong>.
            </li>
            <li>
              <IconWrench /> Falhas esperando reparo pioram até +{Math.round(BALANCE.escalation.max * 100)}%. Uma equipe e uma vaga na fila.
            </li>
            <li>
              <IconPlay />{" "}
              {d.decisionPauses ? (
                <>
                  Nas decisões de reparo <strong>o relógio para</strong> até você escolher.
                </>
              ) : (
                <>
                  Nas decisões de reparo <strong>o relógio continua correndo</strong>.
                </>
              )}
            </li>
            <li>
              <IconCheck /> Pontuação ×{String(d.scoreMultiplier).replace(".", ",")}. Medalha de ouro a partir de {d.medals.gold} pontos-base.
            </li>
          </ul>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onMenu}>
              <IconMenu /> Menu
            </button>
            <button type="button" className="btn btn-primary" onClick={onStart} autoFocus>
              <IconPlay /> Iniciar missão
            </button>
          </div>
        </div>
      </div>
    );
  }
  const stepInfo = TRAINING_STEPS[i];
  const last = i === TRAINING_STEPS.length - 1;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="modal intro">
        <p className="kicker">
          Treinamento · {i + 1}/{TRAINING_STEPS.length}
        </p>
        <h2 id="intro-title">{stepInfo.title}</h2>
        <div className="intro-body">{stepInfo.body}</div>
        <div className="dots" aria-hidden>
          {TRAINING_STEPS.map((_, k) => (
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

function ConfirmButton({ label, question, confirmLabel, onConfirm, Icon }: { label: string; question: string; confirmLabel: string; onConfirm: () => void; Icon: typeof IconInfo }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className="btn" onClick={() => setConfirming(true)}>
        <Icon /> {label}
      </button>
    );
  }
  return (
    <div className="inline-confirm">
      <span>{question}</span>
      <button type="button" className="btn btn-danger" onClick={onConfirm}>
        {confirmLabel}
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
  onMenu,
}: {
  state: SimState;
  resumedFromSave: boolean;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
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
          {missionTitle(state)} · semente {state.mission.seed}
          <br />
          Resgate em {formatClock(remaining)} · falhas resolvidas {resolved}/{state.failures.length}
          {state.repair ? " · reparo em andamento" : ""}
        </p>
        <div className="modal-actions">
          <ConfirmButton label="Menu" question="Abandonar esta missão e voltar ao menu?" confirmLabel="Abandonar" onConfirm={onMenu} Icon={IconMenu} />
          <ConfirmButton label="Reiniciar" question="Recomeçar esta missão do zero?" confirmLabel="Sim, reiniciar" onConfirm={onRestart} Icon={IconRestart} />
          <button type="button" className="btn btn-primary" onClick={onResume} autoFocus>
            <IconPlay /> Retomar
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReportOverlay({
  state,
  result,
  onRestart,
  onNewSeed,
  onMenu,
}: {
  state: SimState;
  result: RecordResult | null;
  onRestart: () => void;
  onNewSeed: () => void;
  onMenu: () => void;
}) {
  const report = buildReport(state);
  if (!report) return null;
  const score = computeScore(state);
  const won = report.result === "won";
  const diff = DIFFICULTIES[state.mission.difficulty];
  const fmtMult = (m: number) => String(m).replace(".", ",");
  const mult = fmtMult(score.multiplier);
  const multipliers = Object.values(DIFFICULTIES)
    .map((d) => `${d.label} ×${fmtMult(d.scoreMultiplier)}`)
    .join(", ");
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className={`modal report ${won ? "is-won" : "is-lost"}`}>
        <p className="kicker">
          Relatório final · {MODULE_NAME} · {missionTitle(state)}
        </p>
        <h2 id="report-title">
          {won ? <IconCheck /> : <IconCritical />} {report.title}
        </h2>
        <div className="score-hero">
          <div>
            <span className="label">Pontuação</span>
            <strong className="mono">{score.total}</strong>
            <span className="sub mono">
              {score.base} pontos-base × {mult} ({diff.label})
            </span>
          </div>
          <div className="score-medal">
            {score.medal ? <MedalBadge medal={score.medal} /> : <span className="muted">Sem medalha</span>}
            {result?.isNewBest ? <span className="new-best">Novo recorde!</span> : result ? <span className="muted small">Recorde: {result.entry.best}</span> : null}
          </div>
        </div>
        <p className="report-cause">
          <strong>{won ? "Estado no resgate:" : "Causa da derrota:"}</strong> {report.cause}
        </p>
        <dl className="report-lines">
          {score.items.map((it) => (
            <div key={it.label}>
              <dt>{it.label}</dt>
              <dd className="mono">{it.points > 0 ? `+${it.points}` : it.points}</dd>
            </div>
          ))}
          <div className="subtotal">
            <dt>Pontos-base</dt>
            <dd className="mono">{score.base}</dd>
          </div>
          <div>
            <dt>
              Multiplicador da dificuldade {diff.label}
              {state.mission.kind === "training" ? " (regras do treinamento)" : ""}
            </dt>
            <dd className="mono">×{mult}</dd>
          </div>
          <div className="total">
            <dt>Pontuação final</dt>
            <dd className="mono">{score.total}</dd>
          </div>
        </dl>
        <p className="score-explain">
          Dificuldades mais altas valem mais: {multipliers}. A medalha usa os pontos-base, antes do multiplicador: no {diff.label}, prata a
          partir de {diff.medals.silver} e ouro a partir de {diff.medals.gold}; sobreviver garante o bronze.
        </p>
        <h3>Módulo</h3>
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
          {state.failures.map((f, i) => (
            <li key={f.id}>
              <FailureIcon id={f.id} /> {report.decisions[i]}
            </li>
          ))}
        </ul>
        <p className="muted small">
          Semente <strong className="mono">{state.mission.seed}</strong>: compartilhe para alguém jogar exatamente a mesma missão
          {state.mission.kind === "random" ? ` na dificuldade ${DIFFICULTIES[state.mission.difficulty].label}` : ""}.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onMenu}>
            <IconMenu /> Menu
          </button>
          <button type="button" className="btn" onClick={onRestart}>
            <IconRestart /> Repetir esta missão
          </button>
          {state.mission.kind === "random" ? (
            <button type="button" className="btn btn-primary" onClick={onNewSeed} autoFocus>
              <IconDice /> Nova missão
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

