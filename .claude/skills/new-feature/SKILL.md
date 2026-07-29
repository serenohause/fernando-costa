---
name: new-feature
description: Use when adding a new feature or vertical slice to a project already built from this template. Triggers on "nova feature", "adicionar funcionalidade X", "preciso de uma tela para Y".
---

# Nova feature (fatia vertical)

Implemente a feature como uma fatia vertical completa, delegando aos
subagentes correspondentes, nesta ordem. **Cada camada termina com um
commit** escopado no nome da feature (convenção em `CLAUDE.md`) — não
acumule tudo num commit só no final.

1. Se a feature introduz uma tela ou fluxo visualmente novo (não só um
   campo a mais numa tela existente), `ui-prototyper` primeiro — protótipo
   HTML curto em `prototypes/`, aprovado pelo usuário, antes do passo 3.
   Para um ajuste pequeno num layout já existente, pode pular direto pro
   `frontend-builder`.
   Commit: `feat(<feature>): protótipo aprovado`.

2. `schema-architect` — tabelas/colunas novas e a migration.
   Commit: `feat(<feature>): schema e migration`.

3. `rls-guardian` — políticas de RLS + teste de isolamento para as tabelas novas.
   Commit: `feat(<feature>): RLS e teste de isolamento`.

4. `frontend-builder` — hook em `src/features/<feature>/hooks.ts` e os
   componentes de UI, fiel ao protótipo do passo 1 quando ele existir.
   Commit: `feat(<feature>): hook e UI`.

5. Se a feature recebe input do usuário (formulário, upload) ou expõe
   dado sensível, rode a skill `security-audit` com escopo nessa feature
   antes de considerá-la pronta. Corrija achados críticos/altos.
   Commit (se houve correção): `fix(<feature>): ajustes de segurança`.

6. Rode a skill `audit-architecture` ao final, antes de considerar a
   feature pronta para revisão.
