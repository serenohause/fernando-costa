---
name: start-project
description: Use when starting a brand new project from this template — the user says things like "vamos começar um projeto novo", "iniciar projeto", describes an app idea for the first time in this repo, or runs /start-project. Guides frontend-first: domain, visual prototype approval, schema, scaffold, auth/RLS foundation, first vertical feature, security audit, and deploy — with a commit at the end of each stage.
---

# Iniciar novo projeto

Fluxo frontend-first: o layout é validado em HTML antes de qualquer schema
ou código React existir. Siga a sequência na ordem — cada etapa alimenta a
seguinte, e as etapas 3 em diante não começam sem a aprovação explícita da
etapa 2. **Cada etapa termina com um commit** (convenção em `CLAUDE.md`) —
não acumule mudanças de etapas diferentes num único commit.

## 1. Definir o domínio

Não sugira solução técnica ainda. Faça perguntas sobre:

- Quem são os usuários finais.
- O que um "tenant" representa neste sistema especificamente (empresa?
  conta pessoal? unidade de negócio? outra coisa?).
- Quais são as 3-5 entidades centrais do sistema.
- Quais são as telas/fluxos principais que o usuário final vai usar no dia a dia.
- Qual seria a primeira feature simples o suficiente para validar a
  arquitetura ponta a ponta.

Registre as respostas na seção "[projeto] Domínio" do `CLAUDE.md` e em
`docs/ARCHITECTURE.md`. Reescreva também o topo do `README.md` (título,
descrição, o que o sistema faz) — mantenha a seção "Desenvolvimento com IA"
no fim do arquivo intacta, ela é referência independente do projeto.

Commit: `docs: definição de domínio e README do projeto`.

## 2. Protótipo visual (gate de aprovação)

Delegue ao subagente `ui-prototyper`: protótipo HTML/CSS estático das
telas/fluxos principais identificados na etapa 1, seguindo o processo de
design dele (plano de tokens, evitar clichês de design de IA, ícones via
Lucide, copy real do domínio, responsivo e acessível).

Apresente os arquivos de `prototypes/` ao usuário e **espere aprovação
explícita**. Iterar aqui é barato; iterar depois que virar componente React
com dado real não é. Não prossiga para a etapa 3 sem essa aprovação.

Commit (só após aprovação): `feat(prototype): protótipo aprovado - <telas>`.

## 3. Plano de schema (sem escrever SQL ainda)

Com o protótipo aprovado, as telas já indicam boa parte dos dados
necessários. Delegue ao subagente `schema-architect`: pedir o desenho das
tabelas principais, relacionamentos, e onde entra `tenant_id` em cada uma —
só o plano em linguagem simples, cruzando com o que as telas do protótipo
efetivamente mostram. Apresente ao usuário e espere aprovação antes de seguir.

Commit: `docs(schema): plano de schema aprovado - <entidades>`.

## 4. Scaffold do projeto + tradução do protótipo

Esta pasta já contém `CLAUDE.md`, `.claude/`, `README.md`, `prototypes/` e
outros arquivos do kit — **não** rode `npm create vite@latest .` direto na
raiz, porque o create-vite cancela silenciosamente numa pasta não vazia (ou,
com `--overwrite`, apaga o que já está aqui).

Em vez disso, scaffold numa subpasta temporária e mova só os arquivos do
Vite para a raiz:

```bash
npm create vite@latest __vite_tmp__ -- --template react-ts --no-interactive
mv __vite_tmp__/index.html __vite_tmp__/package.json __vite_tmp__/src \
   __vite_tmp__/public __vite_tmp__/tsconfig.json __vite_tmp__/tsconfig.app.json \
   __vite_tmp__/tsconfig.node.json __vite_tmp__/vite.config.ts __vite_tmp__/.oxlintrc.json .
rm -rf __vite_tmp__
npm install
npm install tailwindcss @tailwindcss/vite @supabase/supabase-js @tanstack/react-query zod react-router-dom lucide-react
```

Não mova o `README.md` nem o `.gitignore` gerados pelo Vite — os deste kit
já cobrem o que é preciso; descarte os do template.

Configure o Tailwind v4 (plugin em `vite.config.ts`, `@import "tailwindcss"`
no `index.css`) e o alias `@` → `src` no `tsconfig.app.json`. Crie a
estrutura de pastas conforme o `CLAUDE.md` (`src/lib`, `src/features`,
`src/components/ui`).

Depois do scaffold, delegue a `frontend-builder`: traduzir o protótipo
aprovado em `prototypes/` para os componentes-base em React (shell de
navegação, layout geral, tema no `@theme`) — ainda sem dado real, só a
casca visual fiel ao que foi aprovado.

Atualize a seção "Como rodar localmente" do `README.md` com os comandos
reais (`npm install`, `npm run dev`, variáveis de ambiente necessárias —
referenciar o `.env.example`).

Commit: `chore(scaffold): setup do projeto + tradução do protótipo para React`.

## 5. Fundação de auth + multitenancy (o "gate" de backend)

Delegue, nesta ordem, a `schema-architect` e depois `rls-guardian`:

1. Migration com `tenants` e `tenant_users` (relação usuário↔tenant, com role).
2. `tenant_id` configurado como custom claim no JWT via Auth Hook do Supabase.
3. Uma tabela de teste com política de RLS usando esse claim.
4. Testes provando isolamento: tenant A não acessa dado de B; usuário sem
   tenant não acessa nada; `service_role` mantém bypass só server-side.

Não avance para dado real na UI enquanto isso não estiver validado.

Commit: `feat(auth): fundação multitenancy - RLS e testes de isolamento`.

## 6. Primeira fatia vertical

Implemente a feature definida na etapa 1, ponta a ponta: schema → RLS →
hook (`src/features/<feature>/hooks.ts`) → conectar ao componente já
traduzido do protótipo na etapa 4. Delegue a parte visual a
`frontend-builder`, sempre fiel ao protótipo aprovado.

Commit: `feat(<feature>): primeira fatia vertical`.

## 7. Auditoria (arquitetura + segurança)

Rode as skills `audit-architecture` e `security-audit` antes de escalar
para outras features. Se qualquer uma apontar problema, corrija antes de
prosseguir — não deixe achado crítico/alto de segurança em aberto sem o
usuário reconhecer explicitamente o risco.

Commit (só se houve correção): `fix(audit): ajustes de arquitetura e segurança`.

## 8. Deploy

Quando o usuário pedir para publicar, use a skill `deploy` — não antes de
todas as etapas acima estarem validadas. Ao final, adicione as informações
de produção (URL, ambiente) ao `README.md`.

Commit: `docs(deploy): informações de produção`.
