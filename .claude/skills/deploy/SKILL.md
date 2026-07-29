---
name: deploy
description: Use when the user wants to deploy or publish the project to production. Triggers on "deploy", "publicar", "subir pra produção", "colocar no ar".
---

# Deploy

Antes de delegar a `deploy-engineer`, confirme que `/security-audit` já
rodou nesta sessão (ou rode agora) — o checklist do `deploy-engineer` exige
isso como primeiro item.

Delegue ao subagente `deploy-engineer` e siga o checklist dele: auditoria
de segurança sem achado crítico/alto em aberto, migrations aplicadas no
Supabase de produção, RLS habilitada (não só as policies criadas),
variáveis de ambiente corretas na Vercel, e smoke test pós-deploy
confirmando isolamento entre tenants em produção.

Não declare "deploy concluído" sem confirmar explicitamente que a auditoria
de segurança passou, que a RLS está habilitada, e que a service role key
não está exposta no lado do client.
