# Testes

## Módulo 1 — fundação

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

## Módulo 2 — CRM

| Arquivo | O que exercita | O que NÃO cobre |
|---|---|---|
| `crm-schema.sql` | o schema de `clients` por dentro: as três colunas geradas de deduplicação, as duas unicidades parciais, os checks, e a **configuração** de acesso (RLS ligada, 4 policies, `GRANT` de `authenticated`, nada para `anon`) | o comportamento das policies — quem lê e quem escreve é assunto dos dois arquivos abaixo |
| `crm-rls.sql` | as policies de `clients` por dentro do banco, com papel e claim simulados: isolamento entre escritórios, status `on_leave`/`vacation`, e a regra nova do módulo — escrita só para quem tem `can_edit` no menu `crm` | se o JWT do login real carrega o claim |
| `crm-rls.mjs` | a corrente inteira pela rede para `clients`: login real → hook → JWT → PostgREST → `GRANT` → policy, mais `can_edit_menu` chamado por RPC e a **chave publicável** batendo na tabela | nada além do módulo 2 |

`crm-schema.sql` roda contra o schema já aplicado (não recria a tabela), então
serve como regressão: se alguém trocar uma coluna gerada por trigger, afrouxar um
check ou soltar um `GRANT`, um caso acusa.

Os casos 5.2, 5.3 e 5.4 de `crm-schema.sql` eram um marcador de etapa — afirmavam
que `clients` **não** tinha RLS nem `GRANT`, o estado em que a migration 0015 a
deixou. A 0017 inverteu os três. `5.1` (anon sem privilégio algum) é o único que
nunca muda.

### A suíte de RLS do CRM foi testada contra ela mesma

`crm-rls.sql` foi rodada contra sete versões **erradas** da 0017, injetadas na
própria transação e desfeitas no `ROLLBACK`. O cabeçalho do arquivo tem a tabela
de qual defeito derruba qual caso. Dois resultados que mudaram o arquivo:

- Policy de `UPDATE` **sem** `WITH CHECK` não fica sem verificação: o Postgres
  reusa a expressão do `USING`.
- Mesmo com `with check (true)`, mover um cliente para outro escritório continua
  sendo `42501` — quem barra é a policy de `SELECT`, porque a linha resultante
  precisa continuar visível. A tentativa só passa quando as duas são afrouxadas
  juntas.

Ou seja, o caso de comportamento passa com ou sem a cláusula. Quem guarda a
existência dela é uma asserção de catálogo (`11.4` no `crm-rls.sql`, `5.6` no
`crm-schema.sql`), não um caso de comportamento — está registrado na migration
`0018`.

## Rodar

```bash
npm run test:rls           # módulo 1, ponta a ponta (login real)
npm run test:rls:sql       # módulo 1, policies, em transação com ROLLBACK
npm run test:functions     # edge functions publicadas
npm run test:schema:crm    # schema de clients, em transação com ROLLBACK
npm run test:rls:crm       # policies de clients, em transação com ROLLBACK
npm run test:rls:crm:e2e   # clients ponta a ponta, com login real e chave publicável
```

Todos saem com código 1 se qualquer caso falhar. `run-sql.sh` é o runner genérico
dos testes `.sql` (recebe o caminho do arquivo); `run-sql-isolation.sh` ficou como
está, com o arquivo do módulo 1 fixo.

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

Os `.sql` terminam em `ROLLBACK`. Os três `.mjs` limpam no `finally`: apagam os
tenants de teste (que cascateiam colaboradores, permissões, solicitações,
domínios, vínculos e **clientes**) e os usuários de `auth.users` cujo e-mail
começa com o prefixo fixo — `rls-test-`, `ef-test-` e `crm-rls-test-`. Se o
processo morrer no meio, rodar de novo limpa antes de começar.

**Nenhum caso afirma contagem absoluta de tabela.** Toda fixture vive em tenants
próprios (`rls-test-*`, `crm-rls-*`) e toda contagem é escopada neles ou feita sob
um claim que a própria RLS restringe. O motivo é histórico: quatro casos do módulo
1 falharam acusando "bypass quebrado" quando havia fixture de outro processo no
banco, e o bypass estava intacto. Com o seed do módulo 2 no ar, `public.clients`
passa a ter linhas permanentes — caso que depende de tabela vazia passa hoje e
falha depois, longe da causa.

Conferir à mão depois de rodar (o escritório de teste do seed **fica**; o que não
pode sobrar é fixture):

```sql
select slug, (select count(*) from public.collaborators c where c.tenant_id = t.id) as colaboradores
from public.tenants t order by slug;
-- esperado: só fernando-costa-teste (ou nada, se o seed ainda não rodou)

select count(*) from auth.users where email like 'rls-test-%' or email like 'ef-test-%'
                                   or email like 'crm-rls-test-%';
-- esperado: 0
```

## Quando o banco tiver dado de produção

Estes testes gravam no banco apontado pelo `.env`. A partir do momento em que
o dado real do base44 entrar, eles passam a exigir um projeto separado de
staging — está registrado em `docs/ARCHITECTURE.md`, seção "Ambiente de banco".
