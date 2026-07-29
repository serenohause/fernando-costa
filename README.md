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

Requisitos: Node 20+, Docker (para o Supabase local) e a
[CLI do Supabase](https://supabase.com/docs/guides/cli).

```bash
npm install

cp .env.example .env          # preencher com as chaves do Supabase local
supabase start                # sobe Postgres, Auth e Studio em Docker
npm run db:reset              # aplica as migrations e o seed
npm run db:types              # gera src/lib/database.types.ts a partir do schema
npm run dev
```

`supabase start` imprime a `API URL` e a `anon key` do ambiente local — são
elas que vão em `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env`.
A `service_role key` **nunca** entra em variável com prefixo `VITE_`: esse
prefixo publica o valor no bundle que vai para o navegador.

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | typecheck + build de produção |
| `npm run typecheck` | só o typecheck |
| `npm run lint` | oxlint |
| `npm run db:reset` | recria o banco local com migrations + seed |
| `npm run db:types` | regenera os tipos TypeScript do schema |
| `npm run db:test` | roda os testes de RLS e isolamento (pgTAP) |

### Stack

React 19 + Vite + TypeScript, Tailwind CSS v4, shadcn/ui sobre Radix,
React Query, Zod, React Router, Lucide, Supabase (Postgres + Auth +
Storage + Edge Functions).

## Produção

_Preenchido na etapa 8 (deploy), com URL e informações de ambiente._

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
