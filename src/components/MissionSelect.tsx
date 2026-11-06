"use client";

import { useMemo, useState } from "react";
import { BALANCE, DIFFICULTIES, FAILURES, MODULE_NAME } from "@/sim/config";
import { computeFlows, createInitialState, formatClock } from "@/sim/engine";
import { dailySeed, newSeed, normalizeSeed, trainingMission } from "@/sim/random";
import { MEDAL_LABEL, recordKey, type Medal, type RecordEntry, type Records } from "@/sim/scoring";
import type { DifficultyId, FailureId, MissionSpec } from "@/sim/types";
import { FailureIcon } from "./FailureIcon";
import { IconCalendar, IconDice, IconGrad, IconMedal, IconMute, IconPlay, IconVolume } from "./Icons";
import { ModuleArt } from "./ModuleArt";
import type { Prefs } from "./gameStore";

interface Props {
  records: Records;
  prefs: Prefs;
  onStart: (spec: MissionSpec) => void;
  onToggleSound: () => void;
}

export function MedalBadge({ medal }: { medal: Medal | null }) {
  if (!medal) return null;
  return (
    <span className={`medal medal-${medal}`}>
      <IconMedal /> {MEDAL_LABEL[medal]}
    </span>
  );
}

function RecordLine({ entry }: { entry?: RecordEntry }) {
  if (!entry) return <p className="record muted">Sem recorde ainda.</p>;
  return (
    <p className="record">
      Recorde <strong className="mono">{entry.best}</strong> <MedalBadge medal={entry.medal} /> · {entry.wins}/{entry.plays} resgates
    </p>
  );
}

export function MissionSelect({ records, prefs, onStart, onToggleSound }: Props) {
  const [difficulty, setDifficulty] = useState<DifficultyId>("engineer");
  const [seed, setSeed] = useState("");
  const today = useMemo(() => dailySeed(), []);
  const preview = useMemo(() => {
    const s = createInitialState(trainingMission());
    return { s, f: computeFlows(s) };
  }, []);
  const randomSpec = (): MissionSpec => ({ kind: "random", seed: normalizeSeed(seed) || newSeed(), difficulty });
  const dailySpec: MissionSpec = { kind: "daily", seed: today, difficulty: "engineer" };

  return (
    <main className="menu">
      <header className="menu-hero">
        <div className="menu-title">
          <p className="kicker">{MODULE_NAME} · órbita baixa</p>
          <h1>Estação Espacial em Perigo</h1>
          <p className="menu-sub">
            {formatClock(BALANCE.missionDurationS)} até o resgate. Um gerador, uma equipe de reparo e falhas que não param de chegar.
            Decida qual sistema recebe energia agora e qual pode esperar.
          </p>
          <button type="button" className="btn btn-ghost sound-btn" onClick={onToggleSound} aria-pressed={prefs.sound}>
            {prefs.sound ? <IconVolume /> : <IconMute />} Som {prefs.sound ? "ligado" : "desligado"}
          </button>
        </div>
        <div className="menu-art">
          <ModuleArt state={preview.s} flows={preview.f} />
        </div>
      </header>

      <section className="menu-cards" aria-label="Escolha da missão">
        <article className={`mission-card${prefs.trainingDone ? "" : " is-recommended"}`}>
          {!prefs.trainingDone ? <span className="ribbon">Comece por aqui</span> : null}
          <h2>
            <IconGrad /> Treinamento
          </h2>
          <p>Sequência fixa de 5 falhas, sempre igual. Ensina o primeiro ajuste e as duas respostas de cada reparo.</p>
          <p className="chips">
            {(["generator", "cooling", "leak", "scrubber", "solar"] as FailureId[]).map((id) => (
              <span key={id} className="chip">
                <FailureIcon id={id} /> {FAILURES[id].title}
              </span>
            ))}
          </p>
          <RecordLine entry={records[recordKey(trainingMission())]} />
          <button type="button" className="btn btn-primary" onClick={() => onStart(trainingMission())}>
            <IconPlay /> Treinar
          </button>
        </article>

        <article className="mission-card">
          <h2>
            <IconDice /> Missão sorteada
          </h2>
          <p>
            Falhas sorteadas a partir de um catálogo de 8, em ordem, horário e intensidade diferentes a cada rodada. Falhas sem reparo
            pioram com o tempo.
          </p>
          <div className="segmented" role="radiogroup" aria-label="Dificuldade">
            {(Object.keys(DIFFICULTIES) as DifficultyId[]).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={difficulty === d}
                className={difficulty === d ? "seg on" : "seg"}
                onClick={() => setDifficulty(d)}
              >
                {DIFFICULTIES[d].label}
              </button>
            ))}
          </div>
          <p className="muted small">{DIFFICULTIES[difficulty].description}</p>
          <label className="seed-field">
            <span>Semente (opcional)</span>
            <input
              value={seed}
              onChange={(e) => setSeed(normalizeSeed(e.target.value))}
              placeholder="vazia = sortear"
              inputMode="text"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={12}
            />
          </label>
          <RecordLine entry={records[recordKey({ kind: "random", seed: "", difficulty })]} />
          <button type="button" className="btn btn-primary" onClick={() => onStart(randomSpec())}>
            <IconPlay /> {seed ? `Jogar semente ${normalizeSeed(seed)}` : "Sortear e jogar"}
          </button>
        </article>

        <article className="mission-card">
          <h2>
            <IconCalendar /> Desafio do dia
          </h2>
          <p>
            A mesma missão para todo mundo hoje, na dificuldade {DIFFICULTIES.engineer.label}. Compare a pontuação com quem jogar a
            semente <strong className="mono">{today}</strong>.
          </p>
          <RecordLine entry={records[recordKey(dailySpec)]} />
          <button type="button" className="btn btn-primary" onClick={() => onStart(dailySpec)}>
            <IconPlay /> Aceitar desafio
          </button>
        </article>
      </section>
      <footer className="footer">
        <span>Estação Espacial em Perigo · V2</span>
        <span>Progresso e recordes ficam salvos neste navegador.</span>
      </footer>
    </main>
  );
}
