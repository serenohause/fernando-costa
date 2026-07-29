# Backoffice Fernando Costa

Sistema de gestão para escritório de arquitetura: do primeiro contato com o
lead até a última parcela recebida.

## O que o sistema faz

- **CRM** — cadastro de clientes, origem do lead, deduplicação por CPF/CNPJ.
- **Pipeline comercial** — funil de negociações (Lead recebido → Qualificado
  → Proposta enviada → Em negociação → Fechamento), com motivo de perda.
- **Formulário de briefing** — link público com validade de 24h, preenchido
  pelo próprio cliente, sem login.
- **Contratos** — tipo de contrato, valor, forma de cobrança, parcelamento.
- **Projetos** — execução por fases (Briefing → Layout → Perspectivas →
  Projeto Legal → Executivo → Alvará), com responsável comercial e
  responsável operacional separados.
- **Atividades** — trabalho atribuído por colaborador, com prazo,
  coordenador e relatório de produtividade.
- **Financeiro** — contas a receber ligadas a contrato/projeto, contas a
  pagar com categoria e recorrência, por centro de custo.
- **Fornecedores** — cadastro por tipologia, com modelo de parceria e
  comissão.
- **Orçamento por cliente** — checklist com valor estimado, aprovado e
  comissão prevista.
- **Mapa de projetos** — terrenos e obras georreferenciados.
- **Controle de acesso** — seis funções (Diretor, Coordenador,
  Administrativo, Financeiro, Arquiteto, Estagiário), permissão por menu e
  fila de aprovação de novos acessos.

O sistema é multitenant: um tenant é um escritório de arquitetura.

## Origem

Esta é a reconstrução, em React + Vite + TypeScript + Supabase, de um
backoffice que roda hoje na plataforma base44. O código do original está em
`projeto-original/` e é a **fonte da verdade visual e de domínio** — ver
`docs/ARCHITECTURE.md`.

## Como rodar localmente

Requisitos: Node 20+ e a
[CLI do Supabase](https://supabase.com/docs/guides/cli). **Não** usamos
Supabase local em Docker — o banco é o projeto hospedado.

```bash
npm install

supabase link --project-ref <ref-do-projeto>   # uma vez por máquina
cp .env.example .env                           # preencher com URL e anon key
npm run db:push                                # aplica as migrations no projeto
npm run db:types                               # gera src/lib/database.types.ts
npm run dev
```

O `SUPABASE_ACCESS_TOKEN` (token pessoal da CLI) vem do `direnv`, não do
`.env` — é credencial da conta, não do projeto, e não pertence ao
repositório.

A URL e a `anon key` saem de `supabase projects api-keys --project-ref <ref>`
ou do painel, em Settings > API. A `service_role key` **nunca** entra em
variável com prefixo `VITE_`: esse prefixo publica o valor no bundle que vai
para o navegador.

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | typecheck + build de produção |
| `npm run typecheck` | só o typecheck |
| `npm run lint` | oxlint |
| `npm run db:push` | aplica as migrations pendentes no projeto ligado |
| `npm run db:diff` | mostra o que diverge entre as migrations e o banco |
| `npm run db:types` | regenera os tipos TypeScript do schema |

Não existe script de reset. `supabase db reset` apaga o banco inteiro, e o
banco aqui é real — se precisar, é comando digitado à mão, com consciência
do que faz.

### Stack

React 19 + Vite + TypeScript, Tailwind CSS v4, shadcn/ui sobre Radix,
React Query, Zod, React Router, Lucide, Supabase (Postgres + Auth +
Storage + Edge Functions).

## Produção

| Item | Valor |
|---|---|
| URL | https://fernando-costa.vercel.app |
| Hospedagem do frontend | Vercel — projeto `fernando-costa` (org `serenohause-8780s-projects`) |
| Build | preset Vite, `npm run build`, saída em `dist/` |
| Backend | projeto Supabase `yctbmijdyjjcoydasndy`, migrations `0001`–`0013` aplicadas |
| Módulo no ar | 1 — Fundação (auth, equipe, permissões, fila de acesso) |

O que está publicado é o shell de navegação mais as telas de **Equipe** e
**Controle de Acesso**. As demais rotas caem no placeholder até o módulo
delas entrar.

### Variáveis de ambiente na Vercel

Apenas duas, configuradas em Production, Preview e Development:

| Variável | Origem |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | chave publicável (`sb_publishable_…`) |

A `SUPABASE_SERVICE_ROLE_KEY` **não está na Vercel**, com ou sem prefixo.
O frontend não precisa dela: quem usa `service_role` são as Edge Functions,
que rodam no Supabase e recebem a chave da própria plataforma. Tudo que tem
prefixo `VITE_` é embutido no bundle e fica legível para qualquer visitante.

### `vercel.json`

O `rewrites` que joga tudo em `/index.html` é o que faz o roteamento
client-side sobreviver a um refresh: as rotas do original são caminhos reais
(`/Collaborators`, `/AprovacoesAcesso`) e, sem o fallback, a Vercel
devolveria 404 para qualquer acesso direto.

### Deploy

O projeto está conectado ao repositório GitHub, então um push na `main`
dispara build de produção. Para publicar a partir da máquina, sem passar
pelo Git:

```bash
vercel deploy --prod
```

O `VERCEL_TOKEN` vem do `direnv`, junto com o `SUPABASE_ACCESS_TOKEN` — nenhum
dos dois pertence ao repositório.

### Ambiente: produção e desenvolvimento no mesmo banco

Não há projeto Supabase separado para produção. **O que está no ar lê e
escreve o mesmo banco que o desenvolvimento usa**, e ele contém apenas o
escritório de teste. Isso é aceitável enquanto for assim, e deixa de ser no
instante em que o dado real do escritório entrar — a separação em dois
projetos precisa acontecer **antes** da importação. A lista completa do que é
obrigatório antes desse momento está em `docs/ARCHITECTURE.md`, na seção
"Segurança — estado e decisões".

Consequência prática: as contas de teste em `supabase/seed/credenciais.local`
têm senha conhecida e estão acessíveis pela URL pública. São contas de
desenvolvimento e precisam ser apagadas antes de o sistema receber dado real.

---

## Desenvolvimento com IA

Esta pasta foi criada a partir do **Arkeo AI Starter** — um kit reutilizável
(React + Vite + TypeScript + Tailwind + Supabase, multitenant) com Claude
Code configurado para guiar da definição do domínio até o deploy.

### Fluxo

Digite `/start-project` (ou descreva a ideia do projeto — a skill dispara
automaticamente) e o Claude Code conduz, nesta ordem, com um commit ao
final de cada etapa:

1. Perguntas sobre o domínio (usuários, o que é um tenant, entidades centrais, telas principais).
2. **Protótipo visual em HTML** (`prototypes/`) — aprovação sua antes de qualquer schema ou código React.
3. Plano de schema, para aprovação, antes de gerar SQL.
4. Scaffold do projeto (Vite + Tailwind v4 + Supabase + React Query + Zod + Lucide) e tradução do protótipo aprovado para React.
5. Fundação de auth + RLS + teste de isolamento entre tenants.
6. Primeira feature implementada ponta a ponta, conectando dado real à UI já traduzida.
7. Auditoria de arquitetura e de segurança.
8. Deploy (Vercel + Supabase), quando você pedir.

Depois disso:
- Features novas: `/new-feature`.
- Auditar arquitetura a qualquer momento: `/audit-architecture`.
- Auditar segurança a qualquer momento: `/security-audit`.
- Publicar: `/deploy`.

### O que tem aqui dentro

- **`CLAUDE.md`** — stack padrão, modelo de multitenancy, convenção de
  commits e convenções gerais. É a primeira coisa que o Claude Code lê.
- **`.claude/agents/`** — subagentes especializados: `ui-prototyper`,
  `schema-architect`, `rls-guardian`, `frontend-builder`,
  `security-auditor`, `deploy-engineer` — cada um com escopo e ferramentas
  restritas ao que precisa fazer.
- **`.claude/skills/`** — os fluxos de trabalho (`start-project`,
  `new-feature`, `audit-architecture`, `security-audit`, `deploy`),
  invocáveis por `/comando` ou disparados automaticamente.
- **`docs/ARCHITECTURE.md`** — decisões específicas deste domínio.
- **`.env.example`** — variáveis do stack padrão (Supabase).

### Se o stack padrão não servir para este projeto

Edite o `CLAUDE.md` **antes** de rodar `/start-project` — por exemplo, se o
projeto vai ter mobile desde o início, ou single-tenant em vez de
multitenant. As skills e subagentes leem esse arquivo, então uma mudança
ali já reflete em todo o fluxo.

### Por que essa estrutura

O ponto central é não precisar redecidir arquitetura a cada projeto novo:
protótipo aprovado antes de código, multitenancy via `tenant_id` + RLS +
JWT claim, camadas separadas (schema → RLS → hooks → UI), auditoria de
segurança antes do deploy, e histórico de commits granular por etapa/módulo.
Isso reduz retrabalho, risco de vazamento de dados entre clientes, e torna
mais fácil entender o histórico do projeto depois — inclusive para outro
desenvolvedor que entre no meio do caminho.
