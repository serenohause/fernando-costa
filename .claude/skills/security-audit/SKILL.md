---
name: security-audit
description: Use when the user wants a security review of the project, or before deploying to production. Triggers on "auditoria de segurança", "revisar segurança", "isso é seguro?", "antes de publicar".
---

# Auditoria de segurança

Delegue ao subagente `security-auditor` e percorra a checklist dele
(segredos, validação de entrada, dependências, auth, client-side).

Se houver achado crítico ou alto, não prossiga para deploy sem o usuário
reconhecer explicitamente o risco ou pedir a correção. Se o usuário pedir
para corrigir, aplique as correções e finalize com um commit
`fix(security): <descrição>` conforme a convenção do `CLAUDE.md`.
