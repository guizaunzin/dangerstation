import { BALANCE } from "@/sim/config";
import { failureDef, formatClock } from "@/sim/engine";
import type { SimState } from "@/sim/types";
import { FailureIcon } from "./FailureIcon";
import { IconShip } from "./Icons";

/** Distância simulada da nave de resgate no início da missão (km). */
const START_DISTANCE_KM = 9000;

const STATUS_LABEL = {
  warned: "previsto",
  active: "ativa",
  repairing: "em reparo",
  resolved: "resolvida",
  pending: "",
} as const;

export function RescueTimeline({ state }: { state: SimState }) {
  const duration = BALANCE.missionDurationS;
  const progress = Math.min(1, state.t / duration);
  const km = Math.round(START_DISTANCE_KM * (1 - progress));
  const visible = state.failures.filter((f) => f.status !== "pending");
  const hidden = state.failures.filter((f) => f.status === "pending").length;

  return (
    <div className="timeline" aria-label="Linha do tempo do resgate">
      <div className="timeline-head">
        <span>
          <IconShip /> Nave de resgate <strong>Aurora</strong>
        </span>
        <span className="mono">
          {km.toLocaleString("pt-BR")} km · acoplagem em {formatClock(duration - state.t)}
        </span>
      </div>
      <div className="timeline-track">
        <div className="timeline-done" style={{ width: `${progress * 100}%` }} />
        {visible.map((f) => {
          const def = failureDef(f.id);
          return (
            <span
              key={f.id}
              className={`timeline-mark mark-${f.status}`}
              style={{ left: `${(f.at / duration) * 100}%` }}
              title={`${formatClock(f.at)} · ${def.title} (${STATUS_LABEL[f.status]})`}
            >
              <FailureIcon id={f.id} />
              <span className="sr-only">
                {def.title}: {STATUS_LABEL[f.status]} em {formatClock(f.at)}
              </span>
            </span>
          );
        })}
        <span className="timeline-ship" style={{ left: `${progress * 100}%` }} aria-hidden>
          <IconShip />
        </span>
        <span className="timeline-module" aria-hidden>
          <svg viewBox="0 0 24 24" width="1em" height="1em">
            <rect x="7" y="7" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M1 12h6M17 12h6" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
      </div>
      <div className="timeline-foot mono">
        <span>00:00</span>
        <span>{hidden > 0 ? `${hidden} falha(s) ainda não detectada(s)` : "todas as falhas já apareceram"}</span>
        <span>{formatClock(duration)}</span>
      </div>
    </div>
  );
}
