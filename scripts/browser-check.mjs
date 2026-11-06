/**
 * Verificação de ponta a ponta no navegador (Playwright), usando o relógio acelerado.
 *
 *   node scripts/browser-check.mjs [URL] [pasta-de-capturas]
 *
 * Requer o pacote `playwright` com Chromium disponível (não é dependência do projeto).
 * Cobre: menu, treinamento com abertura e primeiro ajuste, pausa/retomada, recarregar no meio
 * de um reparo, vitória, pontuação e recorde; missão sorteada com semente no celular;
 * desafio do dia com derrota por inação.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// `require` resolve o Playwright instalado globalmente (NODE_PATH) ou no projeto.
const { chromium, devices } = createRequire(import.meta.url)("playwright");

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const OUT = process.argv[3] ?? "screenshots";
const SPEED = 20;
const SAVE_KEY = "dangerstation:save:v2";
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
    if (!s || s.phase !== "active") return;
    const cur = s.allocation[system];
    if (cur === kw) return;
    const btn = page.getByRole("button", { name: `${cur < kw ? "Aumentar" : "Diminuir"} ${NAMES[system]}` });
    if (await btn.isDisabled()) return;
    await btn.click();
  }
}

async function pauseGame(page) {
  await page.getByRole("button", { name: "Pausar missão" }).click();
  await page.getByRole("heading", { name: "Missão em pausa" }).waitFor();
}

async function resumeGame(page) {
  await page.getByRole("dialog").getByRole("button", { name: "Retomar" }).click();
}

/** Escolhe uma resposta para a primeira falha ativa e confirma. */
async function repairFirstActive(page, kind) {
  const card = page.locator(".failure-card.is-active").first();
  if (!(await card.count())) return false;
  const btn = card.getByRole("button", { name: kind === "full" ? /Reparo completo/ : /Resposta rápida/ });
  if (await btn.isDisabled()) return false;
  await btn.click();
  await page.getByRole("button", { name: "Confirmar reparo" }).click();
  return true;
}

/**
 * Joga pela interface reagindo como uma pessoa: repara a falha ativa e ajusta a distribuição
 * conforme calor e oxigênio. `policy`: quick | smart (completo quando há folga).
 */
async function playAdaptive(page, policy = "quick") {
  for (let guard = 0; guard < 3000; guard++) {
    const s = await readSave(page);
    if (s.phase === "ended") return s;
    if (!s.repair && s.failures.some((f) => f.status === "active")) {
      const calm = s.heatC < 60 && s.oxygenPct > 55 && s.failures.filter((f) => f.status === "active").length === 1 && s.t < 380;
      await repairFirstActive(page, policy === "smart" && calm ? "full" : "quick");
    }
    let { cooling, life } = s.allocation;
    if (s.heatC > 50) cooling = Math.min(8, cooling + 1);
    else if (s.heatC < 40 && cooling > 2) cooling -= 1;
    if (s.oxygenPct < 70) life = Math.min(8, life + 1);
    else if (s.oxygenPct > 88 && life > 2) life -= 1;
    await setAlloc(page, "cooling", cooling);
    await setAlloc(page, "life", life);
    await page.waitForTimeout(120);
  }
  throw new Error("missão não terminou");
}

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

const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const browser = await chromium.launch();
const desktop = { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 };
const phone = { ...devices["Pixel 7"] };

// 1) Desktop: menu → treinamento completo com recarregar no meio de um reparo.
await scenario(browser, "desktop-treino", desktop, async (page) => {
  await page.goto(`${BASE}/?velocidade=${SPEED}`);
  await page.getByRole("heading", { name: "Estação Espacial em Perigo" }).waitFor();
  check("desktop: menu com três modos", (await page.locator(".mission-card").count()) === 3);
  check("desktop: treinamento recomendado na primeira vez", await page.getByText("Comece por aqui").isVisible());
  await page.screenshot({ path: join(OUT, "desktop-01-menu.png") });
  await page.getByRole("button", { name: "Treinar" }).click();
  await page.getByRole("heading", { name: "Módulo Kestrel em perigo" }).waitFor();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Próximo" }).click();
  check("desktop: abertura ensina o primeiro ajuste", await page.getByText("Seu primeiro ajuste").isVisible());
  await page.getByRole("button", { name: "Iniciar missão" }).click();
  check("desktop: dica do primeiro ajuste aparece", await page.getByText("Primeiro ajuste:").isVisible());
  await setAlloc(page, "cooling", 4);
  check("desktop: dica some após o ajuste", !(await page.getByText("Primeiro ajuste:").isVisible()));
  check("desktop: linha do tempo do resgate visível", await page.getByText("Nave de resgate").isVisible());

  await pauseGame(page);
  const t1 = (await readSave(page)).t;
  await page.waitForTimeout(800);
  check("desktop: pausa congela o relógio", (await readSave(page)).t === t1);
  await resumeGame(page);
  await page.keyboard.press("p");
  await page.getByRole("heading", { name: "Missão em pausa" }).waitFor();
  await page.keyboard.press("p");
  await page.waitForTimeout(500);
  check("desktop: atalho P pausa e retoma", (await readSave(page)).t > t1);

  await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k)).state.failures[0].status === "active", SAVE_KEY);
  await page.screenshot({ path: join(OUT, "desktop-02-falha.png") });
  await page.locator(".failure-card.is-active").first().getByRole("button", { name: /Reparo completo/ }).click();
  check("desktop: confirmação mostra custo e duração", await page.getByText("enquanto a equipe trabalha").isVisible());
  await page.getByRole("button", { name: "Confirmar reparo" }).click();
  await setAlloc(page, "life", 3);
  const before = await readSave(page);
  await page.reload();
  await page.getByRole("heading", { name: "Missão em pausa" }).waitFor();
  const after = await readSave(page);
  check("desktop: recarregar retoma em pausa", await page.getByText("Salvamento local carregado").isVisible());
  check("desktop: reparo em andamento preservado", after.repair?.option === "full" && after.repair.progressS >= before.repair.progressS);
  await resumeGame(page);

  const end = await playAdaptive(page, "quick");
  check("desktop: treinamento vence", end.outcome?.result === "won", JSON.stringify(end.outcome));
  await page.getByRole("heading", { name: "Resgate concluído" }).waitFor();
  check("desktop: relatório mostra pontuação", await page.getByText("Pontuação", { exact: true }).isVisible());
  check("desktop: relatório mostra recorde novo", await page.getByText("Novo recorde!").isVisible());
  await page.screenshot({ path: join(OUT, "desktop-03-relatorio.png") });
  await page.reload();
  check("desktop: relatório sobrevive ao recarregar", await page.getByRole("heading", { name: "Resgate concluído" }).isVisible());
  await page.getByRole("button", { name: "Menu" }).click();
  check("desktop: recorde aparece no menu", await page.locator(".mission-card").first().getByText("Recorde").isVisible());
  check("desktop: recomendação some após treinar", !(await page.getByText("Comece por aqui").isVisible()));
});

// 2) Celular: missão sorteada com semente escolhida.
await scenario(browser, "celular-sorteada", phone, async (page) => {
  await page.goto(`${BASE}/?velocidade=${SPEED}`);
  await page.getByRole("radio", { name: "Engenheiro" }).click();
  await page.getByLabel("Semente (opcional)").fill("teste-1");
  check("celular: menu sem rolagem horizontal", await noHorizontalScroll(page));
  await page.screenshot({ path: join(OUT, "celular-01-menu.png"), fullPage: true });
  await page.getByRole("button", { name: /Jogar semente TESTE-1/ }).click();
  check("celular: briefing mostra a semente", await page.getByText("Briefing · semente TESTE-1").isVisible());
  const s0 = await readSave(page);
  check("celular: Engenheiro sorteia 7 falhas", s0.failures.length === 7, s0.failures.map((f) => f.id).join(","));
  await page.getByRole("button", { name: "Iniciar missão" }).click();
  await setAlloc(page, "cooling", 4);
  await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k)).state.failures.filter((f) => f.status !== "pending").length >= 2, SAVE_KEY);
  await page.screenshot({ path: join(OUT, "celular-02-painel.png"), fullPage: true });
  check("celular: painel sem rolagem horizontal", await noHorizontalScroll(page));
  await page.getByRole("button", { name: "Desligar som" }).click();
  check("celular: botão de som alterna", await page.getByRole("button", { name: "Ligar som" }).isVisible());
  const end = await playAdaptive(page, "smart");
  check("celular: missão sorteada chega ao fim", end.phase === "ended", JSON.stringify(end.outcome));
  await page.locator(".report").waitFor();
  check("celular: relatório mostra a semente", await page.locator(".report").getByText("TESTE-1").first().isVisible());
  await page.screenshot({ path: join(OUT, "celular-03-relatorio.png"), fullPage: true });
  await page.getByRole("button", { name: "Repetir esta missão" }).click();
  const again = await readSave(page);
  check(
    "celular: repetir mantém a mesma sequência",
    JSON.stringify(again.failures.map((f) => [f.id, f.at])) === JSON.stringify(s0.failures.map((f) => [f.id, f.at])),
  );
});

// 3) Celular: desafio do dia sem fazer nada → derrota.
await scenario(browser, "celular-desafio-inacao", phone, async (page) => {
  await page.goto(`${BASE}/?velocidade=60`);
  await page.getByRole("button", { name: "Aceitar desafio" }).click();
  await page.getByRole("button", { name: "Iniciar missão" }).click();
  await page.waitForFunction((k) => JSON.parse(localStorage.getItem(k)).state.critical.heat > 0 || JSON.parse(localStorage.getItem(k)).state.critical.oxygen > 0, SAVE_KEY, { timeout: 60000 });
  await page.screenshot({ path: join(OUT, "celular-04-critico.png") });
  check("celular: contagem para falha crítica visível", await page.getByText("Falha crítica em").first().isVisible());
  await page.getByRole("heading", { name: "Módulo perdido" }).waitFor({ timeout: 60000 });
  const end = await readSave(page);
  check("inação no desafio: derrota", end.outcome?.result === "lost", JSON.stringify(end.outcome));
  check("inação: relatório informa a causa", await page.getByText("Causa da derrota:").isVisible());
  await page.screenshot({ path: join(OUT, "celular-05-derrota.png"), fullPage: true });
  await page.getByRole("button", { name: "Menu" }).click();
  check("volta ao menu", await page.getByRole("heading", { name: "Estação Espacial em Perigo" }).isVisible());
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram.`);
process.exit(failed.length ? 1 : 0);
