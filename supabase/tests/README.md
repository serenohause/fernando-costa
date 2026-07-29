# Testes do módulo 1

Três testes, propositalmente redundantes, porque cobrem elos diferentes da
mesma corrente.

| Arquivo | O que exercita | O que NÃO cobre |
|---|---|---|
| `rls-isolation.sql` | a lógica das policies, por dentro do banco: `set local role` + `request.jwt.claims` reproduzem o que o PostgREST monta a cada request | se o JWT emitido no login realmente carrega o claim `tenant_id` |
| `rls-isolation.mjs` | a corrente inteira pela rede: login real → Auth Hook → JWT assinado → PostgREST → GRANT → policy | nada além do módulo 1 |
| `edge-functions.mjs` | o que roda com `service_role`, onde a RLS não protege nada: autorização lida do banco, tenant resolvido pelo domínio, atomicidade da aprovação | a RLS (é o irmão dos dois de cima, não substituto) |

Um erro de `GRANT`, de RLS desligada ou de hook desativado no painel **some** no
teste SQL e **aparece** no `.mjs`. Rodar os dois.

O terceiro cobre o ângulo oposto: as edge functions têm a chave de bypass na
mão, então nenhuma policy as barra. O que impede abuso ali é a checagem de
autorização que elas fazem lendo o banco — e é isso que o arquivo exercita,
inclusive pelos caminhos negados (Arquiteto, Diretor de outro escritório,
Diretor afastado).

## Rodar

```bash
npm run test:rls        # ponta a ponta (login real)
npm run test:rls:sql    # policies, em transação com ROLLBACK
npm run test:functions  # edge functions publicadas
```

Os três saem com código 1 se qualquer caso falhar.

## Pré-requisitos

- **`.env`** com `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e
  `SUPABASE_SERVICE_ROLE_KEY` (esta última nunca com prefixo `VITE_` — o caso
  6.15 falha de propósito se alguém fizer isso).
- **`SUPABASE_ACCESS_TOKEN`** no ambiente (vem do `direnv`), só para o teste
  SQL, que vai pela Management API por não haver `psql` nem Docker aqui.
- **Auth Hook ligado** em Authentication > Hooks > Customize Access Token (JWT)
  Claims, apontando para `public.custom_access_token_hook`. Sem ele o JWT sai
  sem `tenant_id` e o caso 0.1 acusa.
- Só para `test:functions`: as três funções publicadas
  (`supabase functions deploy register-access-request approve-access-request
  reject-access-request`) e a migration `0013` aplicada — sem
  `public.approve_access_request` os casos 2.9 a 2.12 falham com 500.

## Como ler o resultado

O vocabulário é o mesmo nos dois arquivos:

- `OK:<n>` — a operação passou e devolveu/afetou `n` linhas.
  **`OK:0` em UPDATE/DELETE é negação**: a cláusula `USING` não casou com linha
  nenhuma e o Postgres não levanta erro nesse caso, ele só não faz nada. É
  assim que o cliente enxerga a maior parte das negações de escrita.
- `ERR:42501` — privilégio negado. Cobre três coisas que o cliente enxerga
  igual: falta de `GRANT`, violação de `WITH CHECK` e o trigger
  `collaborators_guard_self_service`.

Os casos marcados **CONTROLE** existem para o teste não passar por motivo
errado: eles afirmam o que cada papel **precisa** conseguir. Sem eles, uma
policy que negasse tudo para todo mundo passaria com nota cheia.

## Onde o service_role entra

Só para montar e limpar fixture, e nos casos 6.1–6.4, que são explicitamente
sobre o bypass. **Nenhuma asserção de policy roda com `service_role`** — todas
rodam autenticadas como usuário comum, com JWT emitido por login de verdade.
Teste de RLS feito com a chave que ignora RLS não prova nada.

## Resíduo

O `.sql` termina em `ROLLBACK`. Os dois `.mjs` limpam no `finally`: apagam os
tenants de teste (que cascateiam colaboradores, permissões, solicitações,
domínios e vínculos) e os usuários de `auth.users` cujo e-mail começa com o
prefixo fixo — `rls-test-` em um, `ef-test-` no outro. Se o processo morrer no
meio, rodar de novo limpa antes de começar.

Conferir à mão depois de rodar:

```sql
select (select count(*) from public.tenants), (select count(*) from auth.users);
-- esperado: 0, 0  (enquanto não houver dado real)
```

## Quando o banco tiver dado de produção

Estes testes gravam no banco apontado pelo `.env`. A partir do momento em que
o dado real do base44 entrar, eles passam a exigir um projeto separado de
staging — está registrado em `docs/ARCHITECTURE.md`, seção "Ambiente de banco".
