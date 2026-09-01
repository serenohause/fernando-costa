---
name: deploy
description: Use when the user wants to deploy or publish the project to production. Triggers on "deploy", "publicar", "subir pra produção", "colocar no ar".
---

# Deploy

## Os dois ambientes, e onde o deploy realmente acontece

| Branch | Projeto Vercel | Projeto Supabase | O que é |
|---|---|---|---|
| `dev` | teste | conta separada, só escritórios de seed | onde o trabalho acontece |
| `main` | `fernando-costa` | dado real do escritório | produção |

**Todo commit vai para `dev`.** Empurrar para `main` só quando o usuário
pedir com todas as letras ("sobe pra main", "manda pra produção"). Ele às
vezes diz "master"; a branch chama-se `main`.

**O PUSH NA `main` É O DEPLOY.** Não existe um passo separado depois dele: a
Vercel observa a branch e publica sozinha, em segundos. Isso inverte a
ordem que o resto deste arquivo pressupõe — o checklist abaixo vale para o
MERGE, e precisa estar cumprido **antes** de ele acontecer, não depois.
Publicar sem auditoria não é um deploy mal feito; é um deploy que já
aconteceu.

## Trocar de ambiente antes de qualquer comando

```
npm run env:prod | env:dev     troca .env e re-linka a CLI do Supabase
npm run env:which              diz qual está ativo, sem trocar nada
npm run env:check              confere o que migration não carrega
```

Os dois projetos Supabase estão em **contas diferentes**, então cada token
pessoal só alcança o seu — trocar o ref sem trocar o token autentica numa
conta apontando para a outra. Por isso os cinco valores viajam juntos, e o
comando os troca de uma vez.

**Conferir `env:which` antes de rodar seed, migration ou importação.** O
erro que este parágrafo existe para impedir já quase aconteceu: uma
importação de dado real de cliente com o ambiente de teste ativo teria
criado CPF, endereço e contrato de 130 pessoas dentro do banco de
desenvolvimento.

`npm run env:check` cobre duas configurações que `db push` **não** carrega
e que, faltando, quebram de formas que não apontam para a causa: o hook
`custom_access_token_hook` (sem ele o JWT nasce sem `tenant_id` e a RLS nega
tudo) e a chave HS256 legada viva (estado que ainda valida token forjado).

## Antes de publicar

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
