## Plano de implementação

### 1. Banco de dados (migrations)
**Nova tabela `user_profile`** (1 por usuário):
- `height_cm` (int), `weight_kg` (numeric), atualizada via upsert
- RLS: dono lê/escreve

**Nova coluna em `matches`:**
- `duration_minutes` (int, default 60) — base para minutos jogados e calorias

### 2. Métricas novas no dashboard (acima dos gráficos)

**Linha de "Performance física"** (nova seção):
- **Calorias gastas** (total + média/partida) — fórmula `duration_minutes * 10`
- **Minutos jogados** (total + conversão para horas, ex.: "1.240 min · 20h 40min")
- **IMC** — calculado de altura/peso com badge ("Abaixo", "Saudável", "Sobrepeso", "Obesidade")
- Botão de editar peso (igual aos botões de edição de partida) abre dialog com peso atual + altura

**Sequências** (card novo):
- Sequência atual com gol / assistência / participação
- Maior sequência histórica

**Médias móveis (últimos 5 jogos):**
- Mini-card mostrando média recente vs. média geral com seta ↑↓

**Comparativo mês atual vs. anterior:**
- % de evolução em gols, assistências, participações

**Distribuição (donut):**
- % de jogos com gol / só assistência / em branco

**Heatmap anual** (estilo GitHub contributions):
- Calendário com intensidade por participações no dia

### 3. Correções estéticas / UX

- **Count-up animado** nos números principais (framer-motion já presente? senão usar requestAnimationFrame leve)
- **Skeleton loaders** substituindo "Carregando..."
- **AlertDialog** (shadcn) substituindo `confirm()` em exclusões (partidas + lances)
- **Hover states** nos cards de partida (borda primary + elevação)
- **Empty states** ilustrados em /index e /melhores-lances quando vazio
- **Recorde pessoal**: badge especial "🏆 Recorde" no card da melhor partida

### 4. Qualidade de vida

- **Filtro por período** nas partidas (todos / 30 dias / 90 dias / ano / mês atual)
- **Exportar CSV** das partidas (botão na lista)
- **PWA**: manifest.json + service worker básico + ícones (instalável no celular)
- **Compartilhar conquista**: botão na "melhor partida" que gera imagem (canvas) e usa Web Share API

### 5. Detalhes técnicos
- Form de registrar partida ganha campo "Duração (min)" com default 60
- Tudo respeita o tema preto/laranja
- Métricas físicas só aparecem se altura+peso preenchidos (CTA bonito senão)
- Gráficos e cálculos no client (sem novas server functions)

### Estimativa de impacto
~5 arquivos novos (user-profile dialog, sequências, heatmap, donut, alertdialog wrapper), 2 migrations, ~400 linhas adicionadas em `index.tsx` e ~80 em `melhores-lances.tsx`, manifest+SW+ícones para PWA.

Posso seguir?