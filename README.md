# [Nome do Projeto]

> Este topo é um placeholder. Ele é reescrito pelo `/start-project` na
> etapa 1 (domínio) com o nome e a descrição reais do projeto, e
> complementado nas etapas de scaffold e deploy. A seção **"Desenvolvimento
> com IA"** mais abaixo é fixa — não é reescrita, é a documentação de como
> este projeto é construído com Claude Code.

_Descrição de uma frase do que o sistema faz, preenchida na etapa 1._

## Como rodar localmente

_Preenchido na etapa 4 (scaffold), com os comandos reais de instalação,
variáveis de ambiente e `npm run dev`._

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
