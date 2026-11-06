import { BALANCE } from "@/sim/config";
import { repairOption } from "@/sim/engine";
import type { Flows, SimState, SystemId } from "@/sim/types";
import { num, signed } from "./format";
import { IconBattery, IconBolt, IconLungs, IconMinus, IconPlus, IconSnow, IconWrench } from "./Icons";

interface Props {
  state: SimState;
  flows: Flows;
  disabled: boolean;
  onSet: (system: SystemId, kw: number) => void;
}

const ROWS: { id: SystemId; name: string; hint: string; Icon: typeof IconSnow }[] = [
  { id: "cooling", name: "Refrigeração", hint: "Remove calor do módulo", Icon: IconSnow },
  { id: "life", name: "Suporte de vida", hint: "Recupera oxigênio", Icon: IconLungs },
  { id: "repair", name: "Reparos", hint: "Alimenta a equipe de reparo", Icon: IconWrench },
];

export function PowerPanel({ state, flows, disabled, onSet }: Props) {
  const step = BALANCE.allocation.stepKw;
  const max = BALANCE.allocation.maxPerSystemKw;
  const balance = flows.generatorKw - flows.demandKw;
  const coach = state.phase === "active" && !state.tutorial.firstAdjustDone;
  const job = state.repair ? repairOption(state.repair.failureId, state.repair.option) : null;
  const genFactor = flows.modifiers.generatorFactor;

  return (
    <section className="panel power" aria-labelledby="power-title">
      <h2 id="power-title" className="panel-title">
        <IconBolt /> Distribuição de energia
      </h2>

      <div className="power-summary">
        <div>
          <span className="label">Gerador</span>
          <strong className="mono">{num(flows.generatorKw, 1)} kW</strong>
          <span className="sub">
            de {BALANCE.generator.nominalKw} kW
            {genFactor < 0.999 ? ` · ${num(genFactor * 100, 0)}% por avaria` : ""}
            {flows.generatorHeatEfficiency < 0.999 ? ` · ${num(flows.generatorHeatEfficiency * 100, 0)}% pelo calor` : ""}
          </span>
        </div>
        <div>
          <span className="label">Pedido</span>
          <strong className="mono">{num(flows.demandKw, 1)} kW</strong>
          <span className="sub">soma dos sistemas</span>
        </div>
        <div className={balance < -0.01 ? "neg" : "pos"}>
          <span className="label">Saldo</span>
          <strong className="mono">{signed(balance, 1)} kW</strong>
          <span className="sub">{balance < -0.01 ? "déficit" : "excedente"}</span>
        </div>
      </div>

      {flows.batteryCovering ? (
        <p className="cover-banner" role="status">
          <IconBattery /> A bateria está cobrindo o déficit de <strong>{num(-flows.batteryKw, 1)} kW</strong>
          {flows.unmetKw > 0.05 ? `, mas faltam ${num(flows.unmetKw, 1)} kW` : ""}.
        </p>
      ) : flows.unmetKw > 0.05 ? (
        <p className="cover-banner is-critical" role="status">
          <IconBattery /> Bateria vazia: os sistemas recebem só {num(flows.supplyRatio * 100, 0)}% do pedido.
        </p>
      ) : null}

      <ul className="alloc-list">
        {ROWS.map(({ id, name, hint, Icon }) => {
          const value = state.allocation[id];
          const supplied = flows.supplied[id];
          let status: string;
          if (id === "repair" && !job) status = value > 0 ? "Sem reparo em andamento: nada é consumido" : "Sem reparo em andamento";
          else if (id === "repair" && job && value < job.powerKw) {
            status = `Reparo pede ${job.powerKw} kW: ritmo ${num(flows.repairSpeed * 100, 0)}%`;
          } else if (flows.supplyRatio < 0.999) status = `Recebendo ${num(supplied, 1)} kW (${num(flows.supplyRatio * 100, 0)}%)`;
          else status = `Recebendo ${num(supplied, 1)} kW`;
          const isCoach = coach && id === "cooling";
          return (
            <li key={id} className={`alloc-row${isCoach ? " coach-target" : ""}`}>
              <div className="alloc-info">
                <span className="alloc-name">
                  <Icon /> {name}
                </span>
                <span className="alloc-hint">{hint}</span>
                <span className="alloc-status">{status}</span>
              </div>
              <div className="stepper" role="group" aria-label={`Potência para ${name}`}>
                <button
                  type="button"
                  className="step-btn"
                  aria-label={`Diminuir ${name}`}
                  disabled={disabled || value <= 0}
                  onClick={() => onSet(id, value - step)}
                >
                  <IconMinus />
                </button>
                <output className="step-value mono" aria-live="polite">
                  {value}
                  <small> kW</small>
                </output>
                <button
                  type="button"
                  className="step-btn"
                  aria-label={`Aumentar ${name}`}
                  disabled={disabled || value >= max}
                  onClick={() => onSet(id, value + step)}
                >
                  <IconPlus />
                </button>
              </div>
              <div className="alloc-pips" aria-hidden>
                {Array.from({ length: max }, (_, i) => (
                  <span key={i} className={i < value ? (i < supplied - 0.01 ? "pip on" : "pip short") : "pip"} />
                ))}
              </div>
              {isCoach ? (
                <p className="coach" role="note">
                  <strong>Primeiro ajuste:</strong> o calor está subindo porque 2 kW de refrigeração não vencem o calor dos
                  equipamentos. Toque em <strong>+</strong> até chegar a <strong>4 kW</strong>. Há excedente no gerador, então não
                  falta energia.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
