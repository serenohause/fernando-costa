# Plano de schema

> Plano em linguagem simples, sem SQL. Cruzado com o que as telas do
> `projeto-original/` efetivamente mostram. SQL só depois da aprovação.

## Convenções aplicadas a todas as tabelas

- Nome de tabela em **inglês, plural, snake_case**.
- `id uuid primary key default gen_random_uuid()`.
- `tenant_id uuid not null references tenants(id)` — sem exceção nas tabelas
  de negócio.
- Índice composto começando por `tenant_id` em toda tabela que o tem.
- `created_at` / `updated_at timestamptz not null default now()`, com
  trigger de `updated_at`.
- `created_by uuid references auth.users(id)` onde a tela do original mostra
  autoria.
- Toda FK aponta para a linha real. A duplicação `*_id` + `*_name` do base44
  **não é portada**, exceto onde o valor precisa ser congelado no tempo
  (ver "Snapshots intencionais").
- Enums viram **tipos enum do Postgres**, não `text` + `check` — o original
  tem 30+ conjuntos fechados e enum dá erro no INSERT em vez de aceitar lixo.

## Multitenancy

```
tenants (id, name, slug, status, created_at)
   └── tenant_users (tenant_id, user_id, role, created_at)   ← relação auth.users ↔ tenant
```

- `tenant_users` é a tabela que o Auth Hook lê para escrever o custom claim
  `tenant_id` no JWT. É a única tabela consultada fora da RLS.
- Toda policy usa `tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid`.
  Nenhuma policy faz subquery em `tenant_users` — isso geraria N+1 dentro
  da própria RLS.
- Usuário sem `tenant_id` no JWT não enxerga nenhuma linha de nenhuma tabela.

`tenant_users.role` é grosso (`owner` / `member`) e serve só ao controle de
plataforma. A função de negócio (Diretor, Coordenador, Arquiteto…) vive em
`collaborators.role` — são coisas diferentes e não devem ser fundidas.

---

# Módulo 1 — Fundação (detalhado)

Este é o único módulo detalhado agora. Os demais estão no panorama abaixo e
serão detalhados quando chegar a vez de cada um.

## `tenants`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `name` | text not null | "Fernando Costa Arquitetura" |
| `slug` | text not null unique | usado em URL e em log |
| `status` | enum `tenant_status` (`active`, `suspended`) | default `active` |

Sem `tenant_id` — é a raiz da hierarquia.

## `tenant_users`

| Coluna | Tipo | Nota |
|---|---|---|
| `tenant_id` | uuid FK → tenants | |
| `user_id` | uuid FK → auth.users | |
| `role` | enum `tenant_role` (`owner`, `member`) | |

PK composta `(tenant_id, user_id)`. Um usuário pertence a **um** tenant nesta
fase; a PK composta já deixa a porta aberta para vários sem migration.

## `collaborators`

Vem de `Collaborator`. É o perfil de negócio do usuário dentro do escritório.

| Coluna | Tipo | Origem / nota |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `user_id` | uuid FK → auth.users, **nullable** | nulo enquanto o colaborador está cadastrado mas ainda não aceitou o convite |
| `name` | text not null | `name` |
| `role` | enum `collaborator_role` | Diretor, Coordenador, Administrativo, Financeiro, Arquiteto, Estagiário |
| `area` | enum `collaborator_area`, nullable | Comercial, Projetos, Operacional, Administrativo, Financeiro |
| `email` | citext not null | e-mail interno. Único por tenant |
| `coordinator_id` | uuid FK → collaborators, nullable | auto-referência; substitui `coordenador_id` + `coordenador_name` |
| `status` | enum `collaborator_status` | Ativo, Férias, Afastado — default Ativo |
| `weekly_hours` | numeric, nullable | base do relatório de produtividade |

**Não portado:** `senha_temporaria` (senha em texto puro) e
`user_auth_email` — o vínculo de login passa a ser `user_id`, e o e-mail de
autenticação é o do `auth.users`.

Restrições: `unique (tenant_id, email)`, `unique (tenant_id, user_id)` onde
`user_id` não é nulo, e um check impedindo `coordinator_id = id`.

Índices: `(tenant_id, status)`, `(tenant_id, role)`, `(tenant_id, coordinator_id)`.

## `menus` e `collaborator_permissions`

Vem de `PermissoesUsuario`, mas **reestruturado**. O original guarda o rótulo
do menu como texto livre, com valores corrompidos (`Negoциações` com
caracteres cirílicos, `Aprova​ções` com zero-width space) e duplicatas
semânticas (`Clientes` vs `CRM`, `Contratos` vs `Contratos & Propostas`,
`Tarefas` vs `Fluxo do Projeto`). Comparar permissão por string assim é
frágil por construção.

`menus` — tabela de referência, **sem `tenant_id`** (é catálogo do produto,
igual para todo escritório):

| Coluna | Tipo | Exemplo |
|---|---|---|
| `key` | text PK | 18 chaves — as 16 telas (`crm`, `pipeline`, `contracts`, `projects`, `project_flow`, `activities`, `suppliers`, `client_budget`, `map`, `receivables`, `payables`, `team`, `access_control`, `dashboard_overview`, `dashboard_executive`, `dashboard_commercial`) mais os 2 agrupadores (`financial`, `team_group`) |
| `label_pt` | text | rótulo exibido na sidebar |
| `sort_order` | int | ordem no menu |
| `parent_key` | text FK → menus, nullable | `receivables`/`payables` sob `financial`; `team`/`access_control` sob `team_group` |

Os dois agrupadores reproduzem o `allNavigation` do `Layout.jsx` original,
onde "Financeiro" e "Equipe" são itens com `subItems`. Agrupador não recebe
linha de permissão: a sidebar o mostra quando algum filho tem `can_view`.
A lista completa está em `docs/ENUM-MAP.md`.

O `key` é o slug ASCII estável. O rótulo em português vive em `label_pt` e
na UI — trocar o texto do menu nunca invalida uma permissão.

`collaborator_permissions`:

| Coluna | Tipo |
|---|---|
| `tenant_id` | uuid FK |
| `collaborator_id` | uuid FK → collaborators, on delete cascade |
| `menu_key` | text FK → menus |
| `can_view` | boolean not null default false |
| `can_edit` | boolean not null default false |

PK composta `(collaborator_id, menu_key)`. Check: `can_edit` verdadeiro
exige `can_view` verdadeiro — no original nada impede editar um menu que não
se pode ver.

## `access_requests`

Vem de `SolicitacaoAcesso`. Fila de quem tentou entrar e ainda não é
colaborador ativo.

| Coluna | Tipo | Origem |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | uuid FK | |
| `email` | citext not null | `email` |
| `name` | text not null | `nome` |
| `status` | enum `access_request_status` (`pending`, `approved`, `rejected`) | default `pending` |
| `requested_at` | timestamptz not null default now() | `data_solicitacao` |
| `last_attempt_at` | timestamptz | `ultima_tentativa` |
| `attempts` | int not null default 1 | `tentativas` |
| `source` | text | `origem` (signup, login_google, login_email) |
| `decided_by` | uuid FK → collaborators, nullable | substitui `aprovado_por_id` + `aprovado_por_nome` |
| `decided_at` | timestamptz, nullable | `data_decisao` |

Índice parcial `unique (tenant_id, email) where status = 'pending'` — uma
solicitação pendente por e-mail. O original resolve isso varrendo a lista
inteira no cliente (`todasSolicitacoes.find(...)`), o que é uma corrida
esperando para acontecer.

## Como o tenant é descoberto no login

Ponto que o original não tem e precisa ser decidido aqui: quando alguém faz
login e ainda não está em `tenant_users`, o JWT não tem `tenant_id` — e sem
`tenant_id` a RLS não deixa nem gravar a solicitação de acesso.

Proposta: o domínio do e-mail resolve o tenant. Uma tabela
`tenant_email_domains (tenant_id, domain)` mapeia `@fernandocosta.arq.br` →
tenant. A criação da solicitação de acesso passa por uma **edge function com
`service_role`**, que resolve o tenant pelo domínio e grava a linha. O
cliente anônimo nunca escreve direto em `access_requests`. E-mail de domínio
desconhecido é recusado sem criar nada.

## Regras de RLS deste módulo

> **Correção de 2026-07-29.** A versão anterior desta matriz dizia
> "Diretor e Administrativo" nas linhas de escrita e em duas de leitura.
> **Estava errada em relação ao original.** Em
> `projeto-original/src/pages/Collaborators.jsx:61` o guarda é
> `currentUser?.role === 'admin' || currentCollaborator?.role === 'Diretor'`,
> e o `'admin'` desse OU é o papel de **plataforma do base44** (o dono da
> conta), não o `Administrativo` do escritório — nomes parecidos, níveis
> diferentes. A linha 318 bloqueia a página inteira para quem não passa nesse
> teste ("Apenas Admin e Diretor podem gerenciar colaboradores"), e
> `AprovacoesAcesso.jsx:153` repete o bloqueio para a fila de aprovação.
> `Administrativo` nunca foi gestor de equipe. O equivalente do `'admin'` de
> plataforma no modelo novo é o `service_role`, que já tem bypass.
> Implementado na migration `0012`.

| Tabela | Quem lê | Quem escreve |
|---|---|---|
| `tenants` | colaborador ativo do tenant | ninguém pelo cliente (só `service_role`) |
| `tenant_users` | o próprio usuário ativo vê a sua linha | só `service_role` |
| `tenant_email_domains` | ninguém pelo cliente | só `service_role` (edge function resolve o tenant por aqui) |
| `collaborators` | qualquer colaborador ativo do tenant | **só Diretor** |
| `menus` | qualquer colaborador ativo | ninguém (catálogo estático, via migration) |
| `collaborator_permissions` | o colaborador vê as suas; **Diretor** vê todas | **só Diretor** |
| `access_requests` | **só Diretor** | só `service_role` (via edge function) |

Por que `collaborators` continua legível por todo colaborador ativo, mesmo a
página Equipe sendo Diretor-only: a lista de colaboradores alimenta seletor de
coordenador e de responsável no sistema inteiro (módulos 5 e 6). Quem esconde a
tela Equipe de quem não é Diretor é a permissão de menu, não a RLS.

O que o `Administrativo` mantém: ler a equipe, ler as próprias permissões, ler o
próprio escritório. O que ele perde: escrever colaborador, escrever permissão,
ler permissão alheia, ler a fila de aprovação.

Duas leituras ficaram **mais apertadas** do que a matriz original pedia, e é
proposital:

- `menus` era "qualquer autenticado". A regra transversal (status ≠ ativo não lê
  nada) é mais forte, e é teste obrigatório aqui embaixo — abrir exceção em
  `menus` quebraria a invariante que todos os módulos seguintes herdam.
- `tenant_users` era "o próprio usuário vê a sua linha", virou "o próprio
  usuário **ativo**". Não custa funcionalidade: `tenant_id` e `tenant_role` já
  viajam no JWT.

Regra transversal: **colaborador com `status <> 'Ativo'` não lê nada** em
nenhum módulo. Isso vira uma função `is_active_collaborator()` usada em
todas as policies do sistema, não só nas deste módulo.

Duas coisas que policy não expressa e por isso viraram trigger
(`collaborators_guard_self_service`, migration `0009`): a comparação entre a
linha antiga e a nova. `WITH CHECK` não enxerga a antiga e `USING` não enxerga a
nova, então trocar a própria `role`, criar linha já vinculada ao próprio
`auth.uid()` ou desvincular a própria linha para sequestrar outra só dá para
barrar em `BEFORE INSERT OR UPDATE`. Vale inclusive para o Diretor.

Testes de isolamento obrigatórios antes de seguir para o módulo 2:

1. Tenant A não lê nenhuma linha de tenant B, em nenhuma das tabelas.
2. Usuário autenticado sem linha em `tenant_users` não lê nada.
3. Colaborador com status `Afastado` não lê nada.
4. Arquiteto não consegue alterar `collaborator_permissions` de ninguém,
   nem as próprias.
5. Arquiteto não consegue escalar a própria `role` para Diretor.
6. `service_role` mantém bypass, e só server-side.
7. Escrita cruzada entre tenants, não só leitura: ninguém grava linha com
   `tenant_id` de outro escritório, nem move linha própria para lá.
8. `Administrativo` não gerencia equipe — e **ainda consegue** ler a equipe e
   as próprias permissões (o caso de controle importa tanto quanto a negação).
9. Nem o Diretor troca a própria `role` ou o próprio `user_id`.

Implementados em `supabase/tests/rls-isolation.sql` (policies, em transação com
`ROLLBACK`) e `supabase/tests/rls-isolation.mjs` (ponta a ponta: login real →
Auth Hook → JWT → PostgREST → GRANT → policy). Ver `supabase/tests/README.md`.

## Edge functions deste módulo

Portadas de `base44/functions/`:

- `approve-access-request` (de `aprovarColaborador`) — valida que quem chama
  é Diretor, cria ou reativa o colaborador, semeia as permissões em `false`,
  marca a solicitação como aprovada e dispara o convite do Supabase Auth.
  No original a checagem de autorização é feita **dentro** da função, com
  `service_role` fazendo o resto. Mantém-se essa forma, agora com a RLS
  como segunda barreira.
- `manage-collaborator` (de `gerenciarColaborador`).
- `register-access-request` — nova, resolve o tenant pelo domínio do e-mail
  (ver acima).

---

# Panorama dos demais módulos

Só os nomes de tabela, as relações e as decisões que já dá para fixar.
Cada um será detalhado no seu módulo.

## Módulo 2 — CRM

`clients` (de `Client`). Guarda `tax_id` (CPF/CNPJ como digitado) e
`tax_id_normalized` (só dígitos) + `email_normalized` — os dois campos
normalizados existem no original e servem à deduplicação. Vira
`unique (tenant_id, tax_id_normalized)` parcial, onde não nulo.

## Módulo 3 — Pipeline

- `negotiations` (de `Negociacao`) → FK para `clients` e para
  `collaborators` (responsável comercial).
- `negotiation_services` — o original guarda `tipo_servico` como array de
  enum. Vira tabela de junção, porque a tela filtra o funil por tipo de
  serviço e array não indexa bem para isso.
- `client_intakes` (de `ClientIntake`) — formulário público. `token` uuid
  único, `expires_at`. **Única superfície do sistema gravada sem sessão
  autenticada**; ver tratamento em `docs/ARCHITECTURE.md`.

## Módulo 4 — Contratos

`contracts` (de `Contract`, 40 campos) → FK para `clients` e `projects`.
O parcelamento (`periodicidade_parcelas`, número de parcelas) gera as linhas
de `accounts_receivable` do módulo 7.

## Módulo 5 — Projetos

- `projects` (de `Project`, 45 campos) → FK para `clients` e `contracts`,
  mais **dois** responsáveis distintos: `commercial_responsible_id` e
  `operational_responsible_id`, ambos FK para `collaborators`. O original já
  separa os dois e a UI depende disso.
- `tasks` (de `Task`) → FK para `projects` e `collaborators`.
- `project_phase` é enum compartilhado entre `projects.current_phase` e
  `tasks.phase` — no original são duas listas quase iguais, e `projects`
  tem um valor a mais (`Finalizado`). **Divergência a confirmar com o
  usuário** quando chegar o módulo 5.

## Módulo 6 — Atividades

`activities` (de `Atividade`) → FK para `collaborators` (responsável e
coordenador), `projects` e `clients`, ambos opcionais. Base do
`RelatorioProdutividade`, que cruza `weekly_hours` do colaborador com as
horas das atividades.

## Módulo 7 — Financeiro

- `accounts_receivable`, `accounts_payable`, `financial_categories`.
- Os dois primeiros compartilham o enum de status (`Previsto`, `Pago`,
  `Em atraso`, `Negociado`) e o conceito de vencimento. **"Em atraso" não é
  status gravado** — é `status = 'Previsto' and due_date < current_date`.
  Gravar isso como estado exige um job diário e desincroniza; vira coluna
  gerada ou view.
- `accounts_payable` tem recorrência (frequência + status da recorrência).
  Cada ocorrência é uma linha, com FK para a linha-mãe.

## Módulo 8 — Fornecedores e Orçamento

- `suppliers` (de `Fornecedor`) + `supplier_brands` (o campo
  `marcas_representadas` é array de texto no original).
- `budget_checklists` (de `ChecklistOrcamento`) + `budget_checklist_items` —
  os totais (`valor_total_estimado`, `valor_total_aprovado`,
  `valor_total_comissao`) são **derivados dos itens**, não colunas gravadas.
  No original são campos soltos que podem divergir da soma real.

## Módulo 9 — Mapa

`map_properties` (de `PropriedadeMapa`). `lat`/`lng` viram `geography(Point)`
com PostGIS, e não dois `numeric` soltos — a tela agrupa marcadores por
proximidade (`react-leaflet-cluster`) e filtra por raio.

## Módulo 10 — Dashboards

Sem tabela nova. São agregações sobre os módulos anteriores. Onde a query
ficar pesada, entra view materializada — decisão adiada até haver volume
real de dado.

## Snapshots intencionais

Poucos casos em que a cópia do valor é mantida de propósito, porque o dado
precisa ficar congelado no tempo:

| Tabela | Campo copiado | Por quê |
|---|---|---|
| `contracts` | nome e documento do cliente | o contrato assinado registra o que valia na assinatura |
| `accounts_receivable` / `accounts_payable` | descrição da parcela/despesa | histórico financeiro não muda quando o cadastro muda |

Fora desses, `*_name` some e vira join.

## Decisões tomadas sobre importação e enums

**A importação acontece no fim, depois de todos os módulos prontos.** O dado
real está com o cliente e ainda não foi solicitado. O schema já nasce
preparado para receber (colunas `legacy_id` desde a primeira migration), mas
nenhum script de importação é escrito agora — seria escrito contra um
formato de exportação que ninguém viu ainda.

**Cada módulo termina com dados simulados (seed) no tenant de teste.** Não é
detalhe de conveniência: é o que permite ver o módulo funcionando de ponta a
ponta — lista cheia, lista vazia, erro, filtro, permissão por função — antes
de passar para o próximo. Regras do seed:

- Vive em `supabase/seed/<NN>-<modulo>.sql`, um arquivo por módulo, aplicado
  na ordem.
- Grava **apenas** no tenant de teste. Nunca roda contra produção — a
  primeira linha de cada arquivo confere o tenant e aborta se não bater.
- Dado plausível do domínio: nomes de cliente, endereços de Goiânia e
  região, valores de contrato de arquitetura residencial. Não `Cliente 1`,
  `Cliente 2` — dado genérico esconde bug de formatação e de ordenação.
- Cobre os casos de borda que a tela precisa tratar: parcela vencida,
  projeto sem contrato, colaborador afastado, negociação perdida.
- Cria um usuário de teste por função (Diretor, Coordenador, Financeiro,
  Arquiteto), para conferir o que cada um enxerga.

Consequências da importação futura no schema:

- Toda tabela migrada ganha `legacy_id text`, com o id original do base44, e
  `unique (tenant_id, legacy_id)`. É por ele que as ligações entre tabelas
  são refeitas (o base44 guarda `client_id` apontando para o id dele) e que
  reimportar não duplica linha.
- A ordem de importação segue a ordem dos módulos, porque uma tabela só
  entra depois das que ela referencia.
- Linha órfã (aponta para um `legacy_id` que não existe) **não é
  silenciosamente descartada nem apontada para nulo**: vai para um relatório
  de pendências para decisão humana.

**Valores de enum em inglês, rótulo em português na UI.** O de/para completo
está em `docs/ENUM-MAP.md` — 30 conjuntos de valores, incluindo os casos
onde o original usa dois rótulos diferentes para o mesmo conceito. Valor que
chegar do base44 e não estiver no de/para derruba aquela linha para o
relatório de pendências; nunca vira `other` no silêncio.

## Pendências da etapa de importação (fim do projeto)

Ficam registradas aqui para não se perderem no caminho:

1. **Pedir o dado ao cliente.** Falta definir com ele se o painel do base44
   exporta JSON ou se a extração é via SDK com `service_role`.
2. **Conflito de permissões duplicadas.** Colaboradores que tenham
   `Clientes` e `CRM` (ou outra dupla) com valores diferentes de
   `can_view`/`can_edit` precisam de conferência humana — a importação
   aplica o mais permissivo e lista o caso.
3. **Vínculo colaborador ↔ login.** O base44 guarda `user_auth_email`. Na
   importação, cada colaborador precisa virar um convite do Supabase Auth,
   e o `user_id` só é preenchido quando a pessoa aceita.
4. **Rodar contra o tenant real, não o de teste.** O seed e o dado
   importado nunca convivem no mesmo tenant.
