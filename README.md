# Estação Espacial em Perigo

Jogo solo de gestão de crises em um único módulo orbital. Você tem **10 minutos de jogo ativo** até a nave de resgate acoplar e precisa decidir o tempo todo **qual sistema recebe energia agora e qual pode esperar**.

Roda inteira no navegador, sem conta, sem banco de dados e sem serviços pagos. Progresso, recordes e preferências ficam no `localStorage`.

## Como rodar

Requisitos: Node.js 20.9 ou mais novo, npm.

```bash
npm install
npm run dev          # http://localhost:3000
```

Produção local:

```bash
npm run build
npm start
```

| Comando | O que faz |
| --- | --- |
| `npm run lint` | ESLint (config do Next.js + TypeScript) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Testes da simulação (Vitest), com o relógio acelerado e o robô jogador |
| `npm run balance` | Taxas de vitória do robô por dificuldade em 200 sementes (`-- --seeds=500` para mais) |
| `npm run e2e -- <URL> [pasta]` | Verificação no navegador com Playwright (desktop e celular). Precisa do pacote `playwright` com Chromium disponível; ele não é dependência do projeto |

### Relógio acelerado

Adicione `?velocidade=N` (ou `?speed=N`) à URL para multiplicar o relógio do jogo, de 1 a 120. Exemplo: `http://localhost:3000/?velocidade=20` faz a missão inteira levar 30 s. Um selo "Relógio acelerado ×N" aparece no topo.

## Como jogar

### Modos

- **Treinamento**: sequência fixa de 5 falhas, sempre igual. A abertura ensina o primeiro ajuste (subir a refrigeração de 2 para 4 kW). Recomendado na primeira vez.
- **Missão sorteada**: as falhas saem de um catálogo de 8 tipos, com ordem, horários e intensidade sorteados a partir de uma **semente**. Deixe o campo vazio para sortear ou digite uma semente (ex.: `K7Q-2MX`) para repetir ou compartilhar a mesma missão.
- **Desafio do dia**: a mesma semente para todo mundo no dia (`DIA-AAAAMMDD`), na dificuldade Engenheiro.

| Dificuldade | Falhas | Intensidade | Gerador | Aviso prévio | Tolerância crítica | Pontos |
| --- | --- | --- | --- | --- | --- | --- |
| Cadete | 5 | ×1,0 | 12,5 kW | 25 s | 60 s | ×0,8 |
| Engenheiro | 7 | ×1,3 | 11,5 kW | 20 s | 45 s | ×1,0 |
| Comandante | 8 (todas) | ×1,5 | 11 kW | 15 s | 30 s | ×1,35 |

### Recursos

- **Energia**: você divide a potência do gerador entre Refrigeração, Suporte de vida e Reparos com os botões − e +. Se o pedido passar da geração, a **bateria cobre o déficit** (até 6 kW) enquanto durar. Com excedente ela recarrega, mas a recarga é bloqueada acima de 65 °C.
- **Calor**: equipamentos, carga elétrica, reparos e algumas falhas esquentam o módulo. Acima de 55 °C o gerador rende menos, o que pode virar uma cascata.
- **Oxigênio**: a tripulação consome 0,10 %/s. O suporte de vida repõe 0,025 %/s por kW. Vazamentos e incêndio aceleram a perda.

### Falhas

Os sensores avisam antes de cada falha, e a linha do tempo no topo mostra a nave Aurora se aproximando e as falhas previstas e já ocorridas. Cada falha tem duas respostas:

| Falha | Efeito (intensidade 1) | Resposta rápida | Reparo completo |
| --- | --- | --- | --- |
| Queda de geração | gerador a 55% | 2 kW · 20 s; gerador a 85% e +0,03 °C/s | 4 kW · 60 s, esquenta durante |
| Refrigeração degradada | refrigeração a 40% | 2 kW · 15 s; refrigeração a 75% | 3 kW · 60 s, circuito a 50% durante |
| Vazamento de oxigênio | −0,15 %/s | 1 kW · 12 s; −0,04 %/s residual | 4 kW · 50 s |
| Tempestade solar | +0,12 °C/s e gerador a 85% | 2 kW · 15 s; +0,04 °C/s residual | 3 kW · 45 s |
| Incêndio elétrico | +0,22 °C/s e −0,06 %/s | 1 kW · 8 s (ventilar); válvula vaza 0,03 %/s | 3 kW · 35 s, fogo continua durante |
| Pane do reciclador de CO₂ | suporte de vida a 50% | 1 kW · 12 s; suporte de vida a 80% | 3 kW · 50 s |
| Curto na bateria | descarga a 35%, capacidade a 75% | 1 kW · 12 s; capacidade a 60% | 4 kW · 55 s |
| Micrometeorito | −0,08 %/s e refrigeração a 75% | 1 kW · 12 s; −0,02 %/s e refrigeração a 90% | 3 kW · 45 s |

- Uma equipe, um reparo por vez. Antes de confirmar, a tela mostra custo, duração, efeito esperado e a projeção de energia, calor e oxigênio. A escolha vale até o resgate.
- **Falhas esperando reparo pioram**: +20% de intensidade por minuto, até +60%. A equipe trabalhando segura o agravamento.
- **Derrota**: calor acima de 85 °C ou oxigênio abaixo de 20% pelo tempo de tolerância da dificuldade. Um contador mostra quanto falta; fora do nível crítico a margem se recupera 1 s por segundo.
- **Vitória**: chegar a 00:00 com o módulo habitável.

### Pontuação e medalhas

O relatório final mostra a causa da derrota ou o estado do módulo no resgate, e a pontuação:

- até 400 pontos pela sobrevivência (proporcional ao tempo, se perder);
- até 150 pela margem de calor, 150 pelo oxigênio e 100 pela bateria no resgate;
- até 150 pelas falhas resolvidas;
- −3 por segundo em nível crítico.

O total é multiplicado pelo fator da dificuldade. Sobreviver dá **bronze**; prata e ouro exigem pontos-base mínimos por dificuldade (Cadete 840/900, Engenheiro 690/750, Comandante 620/680). O melhor resultado de cada modo fica salvo e aparece no menu.

### Outros controles

Pausa pelo botão ou pelas teclas Espaço/P; a missão também pausa sozinha quando a aba fica em segundo plano. **Recarregar a página** retoma do estado salvo, sempre em pausa, com reparos e consequências preservados. O menu de pausa permite reiniciar ou abandonar a missão. Os alarmes sonoros são sintetizados no navegador e podem ser desligados no botão de som.

## Balanceamento verificado

Um robô jogador (`src/sim/bot.ts`) joga como uma pessoa atenta, decidindo a cada poucos segundos. Os testes (`tests/balance.test.ts`) garantem que:

- No treinamento, a inação perde. Usar só respostas rápidas vence, e usar só reparos completos também vence, deixando o módulo em estados diferentes.
- Nas missões sorteadas, a inação perde em todas as sementes testadas, nas três dificuldades.
- O robô vence pelo menos 95% no Cadete e 75% no Engenheiro; no Comandante a taxa fica entre 20% e 90%, abaixo da do Engenheiro.
- No Engenheiro, insistir só em reparos completos vence menos do que escolher conforme a situação.

Valores atuais (`npm run balance`, 200 sementes, robô reagindo a cada 4 s): Cadete 100%, Engenheiro ~97%, Comandante ~57%. Uma pessoa tende a ficar abaixo do robô.

## Arquitetura

```
src/sim/            simulação pura, sem React e sem navegador
  config.ts         TODOS os parâmetros: balanceamento, dificuldades, catálogo de falhas, treinamento
  random.ts         sementes, PRNG (mulberry32) e sorteio da sequência de falhas
  engine.ts         estado inicial, passo determinístico, ações do jogador, prévia de reparo
  clock.ts          tempo real → passos fixos; pausa e relógio acelerado
  persistence.ts    serialização versionada e validação do salvamento local
  scoring.ts        pontuação, medalhas e recordes
  insights.ts       alertas, tendências, motivos e relatório final para a interface
  events.ts         sinais de apresentação (sons) derivados da mudança de estado
  bot.ts            robô jogador usado nos testes e em `npm run balance`
src/components/     interface (React, client components)
  gameStore.ts      liga simulação, relógio, laço de quadros, localStorage, recordes e sons
  MissionSelect.tsx menu de modos e dificuldades
  RescueTimeline.tsx linha do tempo do resgate
  ModuleArt.tsx     ilustração em SVG do módulo, reagindo ao estado
src/app/            Next.js App Router (página única, CSS em globals.css)
tests/              Vitest
scripts/            balance.ts e browser-check.mjs
```

- O tempo avança em passos fixos de 1 s de jogo (`BALANCE.tickS`). `step(state)` é uma função pura; `advance(state, segundos)` roda vários passos, então os testes cobrem a missão inteira em milissegundos.
- A sequência de falhas é gerada da semente e gravada no estado, então um recarregamento retoma exatamente a mesma missão.
- O salvamento é descartado se estiver corrompido ou se a versão (`SAVE_VERSION`) mudar.

## Ajustar o balanceamento

1. Edite `src/sim/config.ts`:
   - `BALANCE`: gerador, bateria, calor, oxigênio, agravamento, sorteio e duração.
   - `DIFFICULTIES`: falhas por missão, intensidade, gerador, avisos, tolerância, multiplicador e medalhas.
   - `FAILURES`: efeito ativo e as duas respostas de cada falha.
   - `TRAINING`: a sequência fixa do treinamento.
2. Rode `npm run balance` para ver taxas de vitória e medalhas por dificuldade.
3. Rode `npm test`. Os testes falham se a inação deixar de perder, se as rotas do treinamento deixarem de vencer ou se as dificuldades saírem da faixa esperada.
4. Se mudar o formato do estado, incremente `SAVE_VERSION` para invalidar salvamentos antigos.

## Publicar na Vercel

O projeto é um app Next.js padrão, sem variáveis de ambiente.

**Pelo painel (recomendado)**

1. Em <https://vercel.com/new>, importe o repositório `guizaunzin/dangerstation`. A Vercel pede para instalar o app do GitHub se ainda não tiver acesso.
2. Framework: Next.js (detectado sozinho). Build `npm run build`, saída padrão, sem variáveis de ambiente.
3. Clique em Deploy. Depois disso, cada push numa branch gera um preview e cada merge na `main` publica em produção.

**Pela CLI**

```bash
npm i -g vercel
vercel login
vercel link          # associa a pasta ao projeto
vercel               # deploy de preview
vercel --prod        # produção
```

O `vercel.json` fixa o framework como Next.js. Isso importa quando o projeto foi importado com o repositório ainda vazio: nesse caso a Vercel grava o preset "Other" e serve uma página `404 NOT_FOUND`.

Para conferir um deploy: abra a URL, avance a abertura e veja o relógio "Resgate em" começar a descer depois de **Iniciar missão**. Com `?velocidade=20` a missão inteira leva 30 s.
