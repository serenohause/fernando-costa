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

## Módulo de LP: captura de lead do produto

Quatro arquivos, e eles cobrem elos diferentes porque o módulo tem três
superfícies: o banco, uma porta pública sem credencial nenhuma, e uma página
HTML que não passa pelo React.

| Arquivo | O que exercita | O que NÃO cobre |
|---|---|---|
| `leads.sql` | o banco por dentro: a policy que exige `is_platform_admin()`, o `grant update` de COLUNA, a dedup por citext, os checks da linha, e as negações todas com controle positivo ao lado | o que acontece no caminho HTTP: corpo recortado, teto de tamanho, limite de requisição |
| `capture-lead-http.sh` | a porta pública pela HTTP: o corpo é recortado (estado e contador gravados vieram do banco, não da requisição), 64 KB param antes do parse, a 11ª requisição do minuto leva 429, e `anon` batendo direto no PostgREST leva 42501 | a tela |
| `../../tests/lp-formulario.mjs` | o formulário num navegador real: o painel de sucesso recebe o FOCO, cada formulário manda o próprio bloco, e as três recusas têm texto diferente e certo | fidelidade visual |
| `../../tests/lp-fidelidade.mjs` | zero pixel de diferença entre a página construída e `prototypes/lp-hausone.html`, em 1280, 768 e 375 | comportamento |

A FIDELIDADE É TESTE, E NÃO PROMESSA, por um motivo específico deste módulo: o
protótipo roda no CDN do Tailwind v3 e a página roda no v4, e as duas versões
divergem em coisas que não aparecem no diff do código. A pior delas não é nome
de utilitário: `@theme` sem `inline` congelaria as cores no `:root` e as seções
escuras sairiam claras. Isso não falha em teste de unidade nenhum.

Os dois primeiros rodam contra o banco LOCAL, e é a primeira vez que isso
acontece neste projeto. Ver a nota no fim de "Pré-requisitos".

## Rodar

```bash
npm run test:rls           # módulo 1, ponta a ponta (login real)
npm run test:rls:sql       # módulo 1, policies, em transação com ROLLBACK
npm run test:functions     # edge functions publicadas
npm run test:schema:crm    # schema de clients, em transação com ROLLBACK
npm run test:rls:crm       # policies de clients, em transação com ROLLBACK
npm run test:rls:crm:e2e   # clients ponta a ponta, com login real e chave publicável

npm run test:leads         # fila de leads no banco LOCAL, em transação com ROLLBACK
npm run test:capture-lead  # a porta pública pela HTTP, contra o stack LOCAL
npm run test:leads-fila    # a lógica pura da fila (sem banco, sem rede)
npm run test:lp            # o formulário da LP num navegador
npm run test:lp-fidelidade # a LP contra o protótipo, pixel a pixel
```

Todos saem com código 1 se qualquer caso falhar. `run-sql.sh` é o runner genérico
dos testes `.sql` (recebe o caminho do arquivo); `run-sql-isolation.sh` ficou como
está, com o arquivo do módulo 1 fixo.

## Pré-requisitos

- **`.env`** com `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e
  `SUPABASE_SERVICE_ROLE_KEY` (esta última nunca com prefixo `VITE_` — o caso
  6.15 falha de propósito se alguém fizer isso).
- **`SUPABASE_ACCESS_TOKEN`** no ambiente (vem do `direnv`), para os testes SQL
  que vão pela Management API. Eles usam esse caminho porque não há `psql` nesta
  máquina. **Mas há Docker**, e desde o módulo de LP existe um segundo canal,
  descrito logo abaixo.
- **Auth Hook ligado** em Authentication > Hooks > Customize Access Token (JWT)
  Claims, apontando para `public.custom_access_token_hook`. Sem ele o JWT sai
  sem `tenant_id` e o caso 0.1 acusa.
- Só para `test:functions`: as três funções publicadas
  (`supabase functions deploy register-access-request approve-access-request
  reject-access-request`) e a migration `0013` aplicada — sem
  `public.approve_access_request` os casos 2.9 a 2.12 falham com 500.

### O canal LOCAL, que os testes do módulo de LP usam

```bash
supabase start                              # Postgres local, 112 migrations do zero
supabase functions serve capture-lead       # em outro terminal, para test:capture-lead e test:lp
```

`run-sql-local.sh` é o runner `.sql` desse canal: mesmo contrato de saída de
`run-sql.sh`, outro caminho. Ele chama `psql` DENTRO do container, em vez de
passar pela Management API.

ELE EXISTE PORQUE O OUTRO CANAL TEM DOIS PONTOS CEGOS, e os dois apareceram no
mesmo dia: a conta não tem privilégio de query no projeto de **dev**, e quando o
projeto de dev está pausado não há onde rodar teste algum. O banco local não
depende de nenhum dos dois, aplica as migrations **do zero** (verificação mais
forte, não mais fraca: ela pega migration que só funciona em banco que já
existia) e não encosta em dado de cliente.

Se a porta 54322 estiver ocupada por outro projeto Supabase na mesma máquina,
`supabase start` recusa. Trocar as portas do `[db]`/`[api]` em
`supabase/config.toml` resolve, e o arquivo precisa voltar ao que era antes do
commit, porque aquelas portas são as que todo mundo usa.

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
