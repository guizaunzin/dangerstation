/**
 * Verificação de ponta a ponta no navegador (Playwright), usando o relógio acelerado.
 *
 *   node scripts/browser-check.mjs [URL] [pasta-de-capturas]
 *
 * Requer o pacote `playwright` com Chromium disponível (não é dependência do projeto).
 * Cobre: abertura e primeiro ajuste, pausa/retomada, recarregar no meio de um reparo,
 * rota de remendos rápidos (vitória), rota de reparos completos (vitória),
 * inação (derrota) e o relatório final — em desktop e em tela de celular.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// `require` resolve o Playwright instalado globalmente (NODE_PATH) ou no projeto.
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "screenshots";
const SPEED = 40;
const SAVE_KEY = "dangerstation:save:v1";
mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASSOU" : "FALHOU"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function readSave(page) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw).state : null;
  }, SAVE_KEY);
}

const NAMES = { cooling: "Refrigeração", life: "Suporte de vida", repair: "Reparos" };

async function setAlloc(page, system, kw) {
  for (let guard = 0; guard < 12; guard++) {
    const s = await readSave(page);
    const cur = s.allocation[system];
    if (cur === kw) return;
    await page.getByRole("button", { name: `${cur < kw ? "Aumentar" : "Diminuir"} ${NAMES[system]}` }).click();
  }
}

async function startMission(page, url) {
  await page.goto(url);
  await page.getByRole("dialog").waitFor();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Próximo" }).click();
  await page.getByRole("button", { name: "Iniciar missão" }).click();
}

async function pauseGame(page) {
  await page.getByRole("button", { name: "Pausar missão" }).click();
  await page.getByRole("heading", { name: "Missão em pausa" }).waitFor();
}

async function resumeGame(page) {
  await page.getByRole("dialog").getByRole("button", { name: "Retomar" }).click();
}

async function chooseRepair(page, label) {
  await page.getByRole("button", { name: new RegExp(label) }).click();
  await page.getByRole("button", { name: "Confirmar reparo" }).click();
}

/**
 * Joga a missão pela interface, reagindo às falhas como uma pessoa faria
 * (com o relógio acelerado correndo). Devolve o estado final salvo.
 */
async function playPlan(page, plan) {
  const done = new Set();
  for (let guard = 0; guard < 4000; guard++) {
    const s = await readSave(page);
    if (s.phase === "ended") return s;
    for (const step of plan) {
      if (!done.has(step.id) && step.when(s)) {
        done.add(step.id);
        await step.act(page);
      }
    }
    await page.waitForTimeout(40);
  }
  throw new Error("missão não terminou");
}

const failure = (s, id) => s.failures.find((f) => f.id === id);
const isActive = (id) => (s) => failure(s, id).status === "active";
const isResolved = (id) => (s) => failure(s, id).status === "resolved";

const QUICK_PLAN = [
  { id: "g", when: isActive("generator"), act: async (p) => { await chooseRepair(p, "Desvio para barramento auxiliar"); await setAlloc(p, "life", 3); } },
  { id: "g2", when: isResolved("generator"), act: async (p) => setAlloc(p, "cooling", 5) },
  { id: "c", when: isActive("cooling"), act: async (p) => { await chooseRepair(p, "Purga do circuito"); await setAlloc(p, "cooling", 6); } },
  { id: "l", when: isActive("leak"), act: async (p) => { await chooseRepair(p, "Vedação rápida"); await setAlloc(p, "life", 4); } },
];

const FULL_PLAN = [
  { id: "g", when: isActive("generator"), act: async (p) => { await chooseRepair(p, "Recalibrar núcleo do gerador"); await setAlloc(p, "life", 3); } },
  { id: "g2", when: isResolved("generator"), act: async (p) => setAlloc(p, "life", 4) },
  { id: "c", when: isActive("cooling"), act: async (p) => { await chooseRepair(p, "Trocar bomba de refrigerante"); await setAlloc(p, "cooling", 6); await setAlloc(p, "life", 3); } },
  { id: "c2", when: isResolved("cooling"), act: async (p) => { await setAlloc(p, "cooling", 5); await setAlloc(p, "life", 4); } },
  { id: "l", when: isActive("leak"), act: async (p) => { await chooseRepair(p, "Vedação completa"); await setAlloc(p, "life", 5); } },
  { id: "l2", when: isResolved("leak"), act: async (p) => setAlloc(p, "life", 4) },
];

async function scenario(browser, label, contextOptions, fn) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  try {
    await fn(page);
  } catch (e) {
    check(`${label}: execução sem exceções`, false, String(e).split("\n")[0]);
    await page.screenshot({ path: join(OUT, `${label}-erro.png`), fullPage: true });
  }
  check(`${label}: sem erros no console`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await context.close();
}

async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

const browser = await chromium.launch();
const desktop = { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 };
const phone = { ...devices["Pixel 7"] };

// 1) Desktop: abertura, primeiro ajuste, pausa, recarregar no meio do reparo, vitória com remendos rápidos.
await scenario(browser, "desktop-rapido", desktop, async (page) => {
  await page.goto(`${BASE}/?velocidade=${SPEED}`);
  await page.getByRole("heading", { name: "Módulo Kestrel em perigo" }).waitFor();
  await page.screenshot({ path: join(OUT, "desktop-01-abertura.png") });
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Próximo" }).click();
  check("desktop: abertura ensina o primeiro ajuste", await page.getByText("Seu primeiro ajuste").isVisible());
  await page.getByRole("button", { name: "Iniciar missão" }).click();
  check("desktop: dica do primeiro ajuste aparece", await page.getByText("Primeiro ajuste:").isVisible());
  await setAlloc(page, "cooling", 4);
  check("desktop: dica some após o ajuste", !(await page.getByText("Primeiro ajuste:").isVisible()));
  await page.screenshot({ path: join(OUT, "desktop-02-painel.png") });

  await pauseGame(page);
  const t1 = (await readSave(page)).t;
  await page.waitForTimeout(800);
  const t2 = (await readSave(page)).t;
  check("desktop: pausa congela o relógio", t1 === t2, `t=${t1} → ${t2}`);
  await page.screenshot({ path: join(OUT, "desktop-03-pausa.png") });
  await resumeGame(page);
  await page.waitForTimeout(600);
  const t3 = (await readSave(page)).t;
  check("desktop: retomada volta a contar", t3 > t2);
  await page.keyboard.press("p");
  await page.getByRole("heading", { name: "Missão em pausa" }).waitFor();
  check("desktop: atalho P pausa", true);
  await page.keyboard.press("p");
  await page.waitForTimeout(400);
  check("desktop: atalho P retoma", (await readSave(page)).t > t3);

  // Primeira falha: escolhe a resposta rápida e recarrega no meio do reparo.
  await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k)).state.failures[0].status === "active", SAVE_KEY);
  await page.getByRole("button", { name: /Desvio para barramento auxiliar/ }).click();
  check("desktop: confirmação mostra custo e duração", await page.getByText("enquanto a equipe trabalha").isVisible());
  await page.screenshot({ path: join(OUT, "desktop-04-confirmar-reparo.png") });
  await page.getByRole("button", { name: "Confirmar reparo" }).click();
  await setAlloc(page, "life", 3);
  const before = await readSave(page);
  await page.reload();
  await page.getByRole("heading", { name: "Missão em pausa" }).waitFor();
  const after = await readSave(page);
  check("desktop: recarregar retoma em pausa", await page.getByText("Salvamento local carregado").isVisible());
  check(
    "desktop: reparo em andamento preservado",
    after.repair?.failureId === "generator" && after.repair.progressS >= before.repair.progressS && after.t >= before.t,
    `progresso ${before.repair?.progressS} → ${after.repair?.progressS}`,
  );
  await page.waitForTimeout(600);
  check("desktop: relógio parado após recarregar", (await readSave(page)).t === after.t);
  await page.screenshot({ path: join(OUT, "desktop-05-retomada.png") });
  await resumeGame(page);

  const end = await playPlan(page, QUICK_PLAN.slice(1));
  check("desktop: rota de remendos rápidos vence", end.outcome?.result === "won", JSON.stringify(end.outcome));
  check(
    "desktop: consequências da rota rápida registradas",
    end.failures.every((f) => f.resolution === "quick"),
  );
  await page.getByRole("heading", { name: "Resgate concluído" }).waitFor();
  await page.screenshot({ path: join(OUT, "desktop-06-relatorio-vitoria.png") });
  await page.reload();
  check("desktop: relatório final sobrevive ao recarregar", await page.getByRole("heading", { name: "Resgate concluído" }).isVisible());
});

// 2) Celular: rota de reparos completos até a vitória, com recarregar no meio.
await scenario(browser, "celular-completo", phone, async (page) => {
  await startMission(page, `${BASE}/?velocidade=${SPEED}`);
  await setAlloc(page, "cooling", 4);
  check("celular: sem rolagem horizontal", await noHorizontalScroll(page));
  await page.screenshot({ path: join(OUT, "celular-01-painel.png"), fullPage: true });
  await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k)).state.failures[0].status === "active", SAVE_KEY);
  await page.getByRole("button", { name: /Recalibrar núcleo do gerador/ }).click();
  await page.screenshot({ path: join(OUT, "celular-02-confirmar.png") });
  await page.getByRole("button", { name: "Confirmar reparo" }).click();
  await setAlloc(page, "life", 3);
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByRole("heading", { name: "Missão em pausa" }).waitFor();
  const s = await readSave(page);
  check("celular: retomada em pausa com reparo completo preservado", s.repair?.option === "full");
  await page.screenshot({ path: join(OUT, "celular-03-retomada.png") });
  await resumeGame(page);
  const end = await playPlan(page, FULL_PLAN.slice(1));
  check("celular: rota de reparos completos vence", end.outcome?.result === "won", JSON.stringify(end.outcome));
  check("celular: todas as falhas com reparo completo", end.failures.every((f) => f.resolution === "full"));
  await page.getByRole("heading", { name: "Resgate concluído" }).waitFor();
  check("celular: relatório sem rolagem horizontal", await noHorizontalScroll(page));
  await page.screenshot({ path: join(OUT, "celular-04-relatorio-vitoria.png") });
});

// 3) Inação: inicia e não faz nada. Deve perder e mostrar a causa.
await scenario(browser, "celular-inacao", phone, async (page) => {
  await startMission(page, `${BASE}/?velocidade=60`);
  await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k)).state.critical.heat > 0, SAVE_KEY, { timeout: 60000 });
  await page.screenshot({ path: join(OUT, "celular-05-contagem-critica.png") });
  check("celular: contagem para falha crítica visível", await page.getByText("Falha crítica em").first().isVisible());
  await page.getByRole("heading", { name: "Módulo perdido" }).waitFor({ timeout: 60000 });
  const end = await readSave(page);
  check("inação: derrota", end.outcome?.result === "lost", JSON.stringify(end.outcome));
  check("inação: relatório informa a causa", await page.getByText("Causa da derrota:").isVisible());
  await page.screenshot({ path: join(OUT, "celular-06-relatorio-derrota.png") });
  await page.getByRole("button", { name: "Jogar de novo" }).click();
  check("reiniciar volta para a abertura", await page.getByRole("heading", { name: "Módulo Kestrel em perigo" }).isVisible());
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram.`);
process.exit(failed.length ? 1 : 0);
