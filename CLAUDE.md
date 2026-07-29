# CLAUDE.md — Base de Desenvolvimento

> Lido automaticamente pelo Claude Code no início de cada sessão. Define o
> stack padrão e as convenções que valem para qualquer projeto novo criado
> a partir deste template. Ajuste as seções marcadas com [projeto] depois
> que o domínio for definido (isso acontece via `/start-project`).

## Estilo de comunicação: modo caveman

Toda resposta em texto (fora de blocos de código, commits, nomes de
variável/tabela/arquivo e comandos de terminal) é escrita em "caveman
speak": frases curtas, verbos no infinitivo ou sem conjugação
("Claude fazer", "código pronto", "tu querer testar?"), sem conectivos
rebuscados, tom direto e um pouco bruto. Isso vale para o Claude Code e
para qualquer subagente listado abaixo, em qualquer projeto criado a
partir deste template — é um estilo de comunicação, não uma mudança de
comportamento técnico.

Não vira caveman:
- Código, migrations, nomes de função/tabela/variável, mensagens de commit.
- Explicações dentro de comentários de código (regra geral já é não comentar).
- Conteúdo técnico literal (stack traces, JSON, saída de comando).

Se o usuário pedir explicitamente para desligar ("fala normal", "sem
caveman"), Claude volta ao português normal pelo resto da sessão.

## Stack padrão

| Camada | Tecnologia | Observação |
|---|---|---|
| Frontend | React + Vite + TypeScript | |
| Estilo | Tailwind CSS v4 | via `@tailwindcss/vite`, sem `tailwind.config.js` — tema no `@theme` do CSS |
| Backend/DB | Supabase (Postgres, Auth, Storage, Edge Functions) | |
| Estado/dados | React Query (`@tanstack/react-query`) | única forma de acessar dados do Supabase no frontend |
| Validação | Zod | schemas compartilhados entre form e API |
| Roteamento | React Router | |
| Ícones | Lucide (`lucide-react` no React, CDN Lucide no protótipo HTML) | mesma família do começo ao fim |
| Deploy | Vercel (frontend) + Supabase hosted (backend) | ver `deploy-engineer` |

Isso é o padrão de partida. Se o projeto exigir algo diferente (ex: mobile
desde o início, outro provedor de deploy), documentar a exceção aqui antes
de começar a codar.

## Modelo de multitenancy (padrão)

Row-level com `tenant_id`, não schema-per-tenant — mais simples de operar e
alinhado com como o Supabase foi desenhado.

- Toda tabela de negócio tem `tenant_id uuid not null references tenants(id)`.
- Toda tabela com `tenant_id` tem índice composto começando por ele
  (ex: `(tenant_id, created_at)`).
- `tenant_id` do usuário logado vem como **custom claim no JWT**, nunca de
  uma tabela de relação consultada a cada policy (isso gera N+1 dentro da
  própria RLS).
- Nenhuma policy é aceita sem um teste de isolamento correspondente
  (ver responsabilidades do subagente `rls-guardian`).
- RLS nunca é substituída por checagem só no frontend — o frontend trata
  erros de acesso negado, não reimplementa a autorização.

## Fluxo de desenvolvimento: frontend-first

Todo projeto novo começa pelo layout, não pelo schema. `/start-project`
gera primeiro um protótipo HTML estático em `prototypes/` (subagente
`ui-prototyper`), que precisa de aprovação explícita antes de qualquer
schema ou componente React ser criado. O `frontend-builder` depois traduz
esse protótipo aprovado — não desenha UI do zero por conta própria.

**Fidelidade ao protótipo é obrigatória e literal.** Uma vez aprovado, o
protótipo em `prototypes/` é a fonte da verdade visual — cor, tipografia,
espaçamento, hierarquia, breakpoints e microcopy migram para React exatamente
como estão, sem "pequenas melhorias" no caminho. Nenhum subagente (nem o
`frontend-builder`, nem futuras revisões) tem autonomia para ajustar o
layout por conta própria, mesmo que a mudança pareça pequena ou óbvia. Se
algo no protótipo parecer errado ao implementar, a ação é sinalizar ao
usuário e esperar decisão — nunca corrigir silenciosamente. Divergência
sutil (um espaçamento diferente, uma cor "parecida", um breakpoint que não
bate) conta como bug de implementação, não como polimento.

## Estrutura de pastas

```
/prototypes           → protótipos HTML/CSS estáticos, um arquivo por tela/fluxo
                         (fonte da verdade visual até virarem componentes React)
/src
  /lib
    supabase.ts       → client único do Supabase
    /schemas          → validação Zod
  /features
    /<feature>
      hooks.ts         → toda query/mutation React Query desse domínio
      types.ts
      /components
  /components/ui       → componentes genéricos reutilizáveis
  /routes
/supabase
  /migrations          → uma migration por mudança lógica, NNNN_descricao.sql
```

Regra inegociável: nenhuma chamada ao Supabase acontece dentro de um
componente React. Sempre via hook em `/features/*/hooks.ts`.

## Convenções gerais

- Schema do banco em inglês; copy de UI pode ser em português.
- Nome de tabela no singular ou plural — escolher um e manter (`tenants`,
  `tenant_users` — plural, por convenção do Postgres/Supabase).
- Toda tela de listagem trata três estados explicitamente: loading, vazio, erro.
- Cores vêm do `@theme` do `index.css`, nunca hex hardcoded em componente.

## Antes de implementar cada módulo

Antes de escrever código de qualquer parte nova da aplicação — uma
tabela, uma política de RLS, um hook, uma tela, uma etapa de deploy —
explique brevemente (2–4 frases, não um plano extenso):

- o que vai ser feito naquele módulo especificamente;
- o que foi entendido da arquitetura/decisões do projeto que se aplicam
  a ele (qual entidade do domínio, qual regra de multitenancy, qual
  parte do protótipo aprovado, qual decisão anterior do usuário para
  aquele fluxo).

Vale para o orquestrador e para qualquer subagente chamado durante
`/start-project` ou `/new-feature`. A explicação vem antes da
implementação, não depois de já ter escrito o código. Isso não substitui
os pontos que já exigem aprovação explícita (ex: protótipo aprovado antes
do schema) — é só tornar visível o raciocínio antes de agir, mesmo nas
etapas que não pedem aprovação.

## Convenção de commits

Cada etapa do `/start-project` e cada camada de `/new-feature` termina com
um commit — histórico granular por etapa/módulo, não um commit gigante no
final. Cada subagente faz o commit ao concluir seu próprio trabalho, não
deixa acumulado para outro finalizar.

Formato ([Conventional Commits](https://www.conventionalcommits.org/)):
`<tipo>(<escopo>): <descrição>`

- Tipos: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
- Escopo: o nome da etapa (`prototype`, `schema`, `scaffold`, `auth`,
  `audit`, `deploy`) ou o nome da feature/módulo (`pedidos`, `usuarios`).

Exemplos:
```
feat(prototype): protótipo aprovado - dashboard e login
docs(schema): plano de schema aprovado - tenants, pedidos, produtos
feat(auth): fundação multitenancy - RLS e testes de isolamento
feat(pedidos): schema e migration
feat(pedidos): RLS e teste de isolamento
feat(pedidos): hook e UI
fix(security): valida upload de arquivo antes de aceitar
```

Nenhum subagente faz `git push` sozinho — commits ficam locais até você
decidir enviar, exceto quando o próprio `/deploy` exigir (a Vercel
normalmente builda a partir do push).

## README dinâmico

O `README.md` deste kit começa genérico (documentação do template em si).
A partir do `/start-project`, ele passa a descrever o **projeto real**:
- Na etapa de definição de domínio: título, descrição e o que o sistema faz.
- Na etapa de scaffold: instruções reais de "como rodar localmente".
- Na etapa de deploy: informações de produção (URL, ambiente).

A seção "Desenvolvimento com IA" no fim do arquivo (skills/agentes
disponíveis) se mantém como referência — o que muda é o topo do arquivo,
que vira a documentação do produto, não do template.

## Subagentes disponíveis (`.claude/agents/`)

| Agente | Quando usar |
|---|---|
| `ui-prototyper` | protótipo HTML/CSS de telas novas, antes de qualquer schema/React |
| `schema-architect` | desenhar/alterar tabelas, relacionamentos, migrations |
| `rls-guardian` | escrever, revisar ou auditar políticas de RLS e isolamento |
| `frontend-builder` | componentes, hooks, telas em React/Tailwind |
| `security-auditor` | segredos, validação de entrada, dependências, auth — segurança além de RLS |
| `deploy-engineer` | preparar e executar deploy, checklist de produção |

## Skills disponíveis (`.claude/skills/`)

| Skill | Comando | Quando dispara |
|---|---|---|
| `start-project` | `/start-project` | começar um projeto novo do zero |
| `new-feature` | `/new-feature` | adicionar uma feature nova a um projeto existente |
| `audit-architecture` | `/audit-architecture` | auditar código atual contra este CLAUDE.md |
| `security-audit` | `/security-audit` | auditoria de segurança, antes de deploy ou sob pedido |
| `deploy` | `/deploy` | publicar em produção |

Essas skills também disparam automaticamente quando o pedido do usuário
combina com a descrição delas — não é obrigatório digitar o comando.

---

## [projeto] Domínio

_Ver `docs/ARCHITECTURE.md` para o detalhamento completo._

- **Tipo de sistema:** backoffice de gestão para escritório de arquitetura —
  CRM, funil comercial, contratos, execução de projetos, atividades da
  equipe, financeiro, fornecedores, orçamento por cliente e mapa de
  propriedades.
- **Modelo de tenant:** um escritório de arquitetura. O escritório Fernando
  Costa é o primeiro tenant.
- **Entidades centrais:** `tenants`, `Collaborator`, `PermissoesUsuario`,
  `SolicitacaoAcesso`, `Client`, `Negociacao`, `ClientIntake`, `Contract`,
  `Project`, `Task`, `Atividade`, `AccountReceivable`, `AccountPayable`,
  `FinancialCategory`, `Fornecedor`, `ChecklistOrcamento`,
  `PropriedadeMapa`.

### Fonte da verdade visual: `projeto-original/`

Este projeto é a migração de um backoffice que já roda na plataforma
base44. O código-fonte do original está em `projeto-original/` e **ocupa o
lugar de `prototypes/`** — as regras de fidelidade acima valem
integralmente sobre ele, sem etapa de protótipo HTML. Cor, tipografia,
espaçamento, hierarquia, breakpoints e microcopy migram como estão.
Divergência sutil é bug de implementação. Se algo no original parecer
errado, sinalizar ao usuário e esperar decisão — nunca corrigir
silenciosamente.

Decisões de migração já tomadas:

- Multitenancy desde o início, apesar de o original ser single-tenant.
- Tokens de tema portados do Tailwind v3 (`index.css`) para o `@theme` do
  v4, com os mesmos valores HSL.
- shadcn/ui + Radix entram no stack (o original é construído sobre eles).
- Fora de escopo: páginas de marketing (stubs mortos) e
  `Collaborator.senha_temporaria` (senha em texto puro).

Trabalho é módulo a módulo, na ordem definida em `docs/ARCHITECTURE.md`.
Cada módulo é uma fatia vertical: schema → RLS + teste de isolamento →
hooks → UI.
