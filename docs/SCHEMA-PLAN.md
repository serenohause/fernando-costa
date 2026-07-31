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
  é Diretor, cria ou reativa o colaborador, semeia as permissões em `false` e
  marca a solicitação como aprovada. Tudo numa única função do Postgres
  (`approve_access_request`, migration 0013), para não haver estado meio
  gravado se algo falhar no meio. No original a checagem de autorização é
  feita **dentro** da função, com `service_role` fazendo o resto — mantém-se
  essa forma, agora com a RLS como segunda barreira, e a autorização é
  reconferida dentro da transação: entre a leitura e a escrita, o Diretor
  pode ter sido rebaixado.
- `reject-access-request` — mesma checagem, marca a solicitação como
  recusada.
- `register-access-request` — nova, resolve o tenant pelo domínio do e-mail
  (ver acima). Também é ela que vincula o `user_id` de quem o Diretor
  cadastrou antes de a pessoa entrar pela primeira vez.

**`manage-collaborator` não foi escrita.** O plano original a previa, portada
de `gerenciarColaborador`. Depois de a RLS ficar pronta ela virou redundante:
a política já permite que o Diretor escreva em `collaborators` direto pela
Data API, e uma edge function ali só acrescentaria superfície de ataque sem
resolver nada que a policy não resolva. O que a função do base44 fazia de
útil — conferir que quem chama é Diretor — agora é feito pelo banco, em toda
requisição, sem depender de o frontend lembrar de chamar o caminho certo.

Três coisas que o original fazia e que **não** foram portadas por serem
falhas de autorização, não recursos:

- `aprovadoPorId` e `aprovadoPorNome` vinham do corpo da requisição, então
  dava para assinar uma aprovação com o nome de outra pessoa. Agora quem
  aprovou é derivado do JWT.
- `solicitacaoEmail` e `solicitacaoNome` também vinham do corpo. Agora o
  e-mail que identifica o colaborador é o gravado na solicitação.
- A lista de menus a semear era fixa e escrita à mão dentro da função (14
  itens, desatualizada em relação à sidebar). Agora sai da tabela `menus`:
  16 itens, todos os não-agrupadores.

---

# Panorama dos demais módulos

Só os nomes de tabela, as relações e as decisões que já dá para fixar.
Cada um será detalhado no seu módulo.

## Módulo 2 — CRM (detalhado)

Uma tabela: `clients`, de `Client` (26 campos).

### Colunas

| Coluna | Origem | Nota |
|---|---|---|
| `id`, `tenant_id`, `legacy_id`, `created_at`, `updated_at` | — | padrão de toda tabela |
| `name` | `name` | not null |
| `phone` | `phone` | not null — é o WhatsApp, canal principal do escritório |
| `email` | `email` | citext, nullable |
| `client_type` | `client_type` | enum `client_type` (`individual`, `company`) |
| `lead_source` | `lead_source` | enum `lead_source` |
| `tax_id` | `cpf_cnpj` | como a pessoa digitou, com pontuação |
| `birth_date` | `birth_date` | date |
| `notes` | `notes` | text |

**Endereço, duas vezes.** O original tem dois blocos completos: residência
(`current_*`) e obra (`construction_*`). Não viram tabela separada: são 1:1
com o cliente, sempre existem juntos, e o formulário do original os mostra
lado a lado. Normalizar aqui daria um join a mais em toda tela para ganhar
nada.

| Residência | Obra |
|---|---|
| `address_zipcode`, `address_street`, `address_number`, `address_district`, `address_complement`, `address_city`, `address_state`, `address_country` | `site_zipcode`, `site_street`, `site_number`, `site_district`, `site_complement`, `site_city`, `site_state` |

`address_city`, `address_state` e `address_country` são not null (o original
os exige). O bloco da obra é todo nullable — cliente pode existir antes de
haver terreno.

### Deduplicação: o ponto que o original quase acertou

O original mantém três campos derivados — `cpf_cnpj_norm` (só dígitos),
`email_norm` (minúsculo, sem espaço) e `cliente_key` (`doc:xxx` ou
`email:xxx`) — e os preenche **no código do frontend**, a cada gravação.

A intenção está certa: comparar documento com pontuação (`123.456.789-00`)
contra o mesmo documento sem (`12345678900`) nunca casa, então precisa de uma
forma normalizada. O problema é onde a conta é feita. Campo derivado escrito
pela aplicação só está correto enquanto **toda** gravação passar pelo mesmo
caminho. Qualquer importação, correção manual no painel ou tela nova que
esqueça de recalcular deixa o campo desalinhado do original — e a
deduplicação passa a não ver duplicata que existe.

Aqui os três viram **colunas geradas pelo Postgres**:

- `tax_id_digits` — `tax_id` sem nada que não seja dígito
- `email_normalized` — `email` em minúsculas, sem espaço nas pontas
- `client_key` — `doc:<tax_id_digits>` quando há documento, senão
  `email:<email_normalized>`, senão nulo

Coluna gerada não pode ser escrita nem esquecida: o banco recalcula em todo
INSERT e UPDATE. A regra de unicidade passa a valer de verdade:

- `unique (tenant_id, tax_id_digits)` parcial, onde não nulo
- `unique (tenant_id, client_key)` parcial, onde não nulo

O original **não tem** essas restrições — ele calcula a chave e nunca a usa
para impedir a duplicata, só para procurar. Ou seja: hoje dá para cadastrar
o mesmo CPF duas vezes.

**Documento continua opcional** (decisão do usuário, e é o que o original
faz: só nome, telefone, cidade, estado e país são obrigatórios). Lead que
chega pelo Instagram não traz CPF, e exigir na entrada travaria o cadastro
justamente no momento em que ele é mais útil. Consequência aceita: cliente
sem documento e sem e-mail tem `client_key` nulo e fica fora da
deduplicação — os índices são parciais por isso.

### O que a tela faz quando a duplicata é barrada

Decisão do usuário: **não basta recusar.** Ao esbarrar na restrição, a tela
mostra qual cliente já ocupa aquele documento, com link para abri-lo.

O motivo é que o erro quase nunca significa "quis criar duplicata". Significa
"procurei e não achei" — porque digitou o CPF com pontuação diferente da
cadastrada, ou porque o cliente está gravado com outro nome. Devolver só
"CPF já cadastrado" deixa a pessoa exatamente onde ela já estava: sem achar
o cliente.

Implicação para o hook do módulo: ao capturar violação de unicidade
(código `23505` do Postgres), a mutação precisa **consultar** quem tem
aquele `tax_id_digits` e devolver o cliente junto do erro. Sem isso a tela
não tem o que mostrar. É a diferença entre tratar o erro e apenas repassá-lo.

### Índices

`(tenant_id, name)` para a listagem ordenada, `(tenant_id, created_at desc)`
para "mais recentes", e um índice de busca textual sobre nome, e-mail e
telefone — a tela de listagem tem campo de busca livre.

### RLS

Sem novidade estrutural: qualquer colaborador ativo do tenant lê; escrita
para quem tem `can_edit` no menu `crm`. É o primeiro módulo em que a
permissão de menu vira regra de escrita no banco, e não só item escondido na
sidebar — vale testar isso explicitamente.

### Dependências para frente (ficam marcadas, entram depois)

A tela de CRM do original toca duas coisas que ainda não existem:

1. **"Criar Oportunidade"** (`Clients.jsx:137`) cria uma `Negociacao` a
   partir do cliente. Entra no módulo 3.
2. **Histórico do cliente** (`components/clients/ClientHistory.jsx`) lista
   `Project` e `AccountReceivable` daquele cliente, na tela de detalhe.
   Entra nos módulos 5 e 7.

Nenhuma das duas é motivo para adiar o CRM. Ficam como marcação explícita no
código — não como comentário vago, mas apontando o módulo que as liga.

## Módulo 3 — Pipeline (detalhado)

Duas tabelas, e elas são de naturezas diferentes: `negotiations` segue o
padrão de todos os módulos de negócio; `client_intakes` é a exceção do
sistema inteiro.

### `negotiations` (de `Negociacao`, 25 campos)

Padrão, sem novidade estrutural. FK composta para `clients` e para
`collaborators` (responsável comercial). Menu `pipeline`; leitura por
colaborador ativo, escrita por `can_edit_menu('pipeline')`. Entra em
`pattern_tables` e herda as 26 asserções de invariante.

Pontos próprios:

- `negotiation_services` — o original guarda `tipo_servico` como array de
  enum. Vira tabela de junção: a tela filtra o funil por tipo de serviço, e
  array não indexa bem para isso.
- `negotiation_owner_history` — o original guarda `historico_responsavel`
  como array de objeto dentro da linha. Vira tabela: é histórico, cresce sem
  limite, e o que se quer dele é ordenar por data.
- `motivo_perda` e `observacoes_perda` só fazem sentido com
  `status = 'lost'`; `data_fechamento` só com `won` ou `lost`. Vira check.
  O original não impede negociação "Ativa" com motivo de perda preenchido.
- `probabilidade_fechamento` é percentual: check entre 0 e 100. O original
  aceita qualquer número.

### `client_intakes` (de `ClientIntake`, 36 campos)

**A única superfície do sistema gravada sem sessão autenticada.** Formulário
de briefing que o cliente final preenche por um link com validade de 24h.

#### O que o original faz, e por que não pode ser portado

`projeto-original/src/pages/FormularioCliente.jsx`, linhas 55-56:

```js
const intakes = await base44.entities.ClientIntake.list();
const foundIntake = intakes.find(i => i.token === token);
```

A página é pública — `requiresAuth: false` no client (`base44Client.js:12`),
rota registrada em `pages.config.js`, e nenhuma guarda de autenticação no
componente. O código **baixa a lista inteira de briefings para o navegador**
e compara o token no cliente.

`ClientIntake` carrega nome, WhatsApp, e-mail, CPF/CNPJ, data de nascimento
e dois endereços completos. Se o backend do base44 atende essa listagem — o
que `requiresAuth: false` sugere, mas não é possível confirmar de fora —
qualquer visitante da URL do formulário recebe o dado pessoal de todos os
clientes que já receberam link. A listagem acontece **antes** da validação
do token, então nem token válido é necessário.

Isso não é decisão de layout e não entra na regra de fidelidade. Reproduzir
seria construir o vazamento de novo.

#### O desenho aqui

**O token nunca é comparado no navegador.** Duas edge functions, e nenhum
`GRANT` para `anon` na tabela:

- `open-client-intake` — recebe o token, resolve server-side com
  `service_role`, e devolve **somente** a linha correspondente, e somente os
  campos que o formulário precisa preencher. Token inexistente, expirado ou
  já enviado devolve o mesmo formato de recusa: nada que permita descobrir se
  um token existe.
- `submit-client-intake` — recebe o token e os dados, revalida validade e
  status **dentro** da transação (entre abrir o formulário e enviar podem
  passar horas), grava e marca como enviado.

Consequências que o desenho precisa sustentar:

- `token` é uuid gerado no servidor, com unicidade. Nunca sequencial.
- Expiração é conferida no servidor, na hora do envio, não só na abertura.
  O original confere na abertura e de novo no envio pelo cliente — mas quem
  confere é o navegador, e navegador não é autoridade.
- `anon` não recebe privilégio nenhum em `client_intakes`. A tabela tem
  `tenant_id` como todas as outras, e RLS que só atende colaborador ativo do
  escritório — a via pública é exclusivamente a edge function.
- A resposta pública **não** inclui `tenant_id`, `cliente_crm_id`,
  `negociacao_id` nem qualquer id interno. Só o que o formulário exibe.
- Tentativa com token inválido é registrada (o original tem
  `ultimo_erro_link`, `ultimo_acesso_em`, `ultimo_status_validacao`), mas o
  registro é server-side e a resposta ao visitante não muda.

#### O envio NÃO sobrescreve o cadastro do CRM

Decisão do usuário. O original faz o contrário: ao enviar o formulário, os
dados digitados pelo cliente sobrescrevem o registro dele em `Client`.

Isso é escrita sem sessão em dado de negócio que a equipe cura. Um CPF
digitado errado substitui o certo, e ninguém fica sabendo — não há histórico
do que mudou nem quem mudou.

Aqui o briefing fica guardado como foi preenchido, em `client_intakes`, e a
tela de Pipeline mostra o que difere do cadastro para alguém da equipe
decidir aplicar. O dado do cliente continua chegando; o que deixa de existir
é a substituição automática e silenciosa.

Consequência para a UI do módulo: a tela precisa de uma comparação entre o
briefing recebido e o cadastro atual, com aplicação campo a campo. Isso não
existe no original e é trabalho novo.

#### O que precisa de teste próprio, porque o padrão não cobre

A suíte de invariantes afirma "anon não lê e não escreve", e isso continua
valendo aqui. O que ela não sabe testar é a via pública legítima:

1. Token válido abre e devolve **uma** linha — nunca duas.
2. A resposta não contém id interno nem `tenant_id`.
3. ~~Token inexistente, expirado e já enviado devolvem recusas
   indistinguíveis entre si.~~ **Revisado pelo usuário na migration 0026.**
   Só "não encontrado" fica genérico; expirado e já enviado têm desfecho
   próprio, como no original.

   O motivo da revisão: a indistinguibilidade protegia contra descobrir
   token válido por tentativa, e o token é uuid v4 — 122 bits — com limite
   de requisição na frente. Protegia um ataque que já era inviável por outro
   motivo, e cobrava o preço de quem tem o link legitimamente: o cliente que
   preencheu e reabre o próprio link via a mesma recusa seca de quem digitou
   endereço errado, quando o original mostra "Dados Enviados com Sucesso".
   Trocar usabilidade certa por proteção teórica é mau negócio.
4. Envio depois de expirado é recusado, mesmo que a abertura tenha
   funcionado.
5. Envio duas vezes com o mesmo token: o segundo é recusado.
6. Token de um escritório não alcança dado de outro.
7. `anon` continua sem alcançar a tabela direto, com a chave publicável.

## Módulo 4 — Contratos (detalhado)

Uma tabela, `contracts`, de `Contract` (40 campos). **Dentro do padrão**:
`tenant_id`, leitura por colaborador ativo, escrita por
`can_edit_menu('contracts')`. Entra em `pattern_tables` e herda as 26
asserções. Teste próprio curto, só para o que segue.

### Cópia congelada do cliente — intencional, não desnormalização

O contrato guarda `client_full_name`, `client_cpf_cnpj`, `client_birth_date`,
`client_email` e o endereço completo do cliente, além de `client_id`. Isso
**não** é a duplicação `*_id` + `*_name` do base44 que o projeto vem
removendo: é o contrato assinado registrando o que valia na assinatura.

Cliente muda de endereço, corrige o CPF, troca de e-mail. O contrato não
muda junto — se mudasse, o documento deixaria de descrever o que foi
assinado. Portanto essas colunas ficam, com `COMMENT` dizendo por quê, para
que ninguém as "limpe" numa faxina futura achando que são resíduo.

Mesma coisa para `local_*`: é o endereço da obra no momento do contrato.

`origem_lead` e `nome_indicador` também são cópia — vêm da negociação e
congelam a atribuição comercial.

### O que fica para o módulo 7

`quantidade_parcelas`, `data_primeiro_vencimento`, `periodicidade_parcelas` e
`installments_generated` descrevem o parcelamento, mas quem **gera** as
parcelas é `accounts_receivable`, que não existe ainda
(`Contracts.jsx:659-710` no original). As colunas entram agora; o botão que
gera fica marcado com comentário apontando o módulo.

`installments_generated` é bandeira de "já gerou uma vez", para não duplicar.
Ela precisa ser escrita na mesma transação que cria as parcelas — no
original são duas chamadas separadas, e uma falha no meio deixa parcelas
criadas com a bandeira apagada, ou bandeira levantada sem parcelas. Isso é
decisão do módulo 7, registrada aqui para não se perder.

### O que fica para o módulo 5

Os cinco campos `prazo_*` (estudo de layout, perspectivas, projeto legal,
executivo, complementares, em dias úteis) alimentam o cronograma do projeto.
Entram como coluna agora; quem os usa é o módulo 5.

### `file_url` não é portado

Coluna morta: nenhuma tela do original a lê ou escreve. O único upload do
sistema está em `components/orcamento/PdfUploadButton.jsx`, do módulo 8.
Trazer a coluna significaria carregar uma superfície de arquivo que ninguém
usa. Quando o módulo 8 chegar, o upload é desenhado uma vez, com bucket e
política próprios.

### Regra de negócio para o teste próprio

O que a suíte de invariantes não tem como conhecer:

- `contract_number` único por escritório — o original não impede dois
  contratos com o mesmo número.
- `total_value >= 0`.
- `quantidade_parcelas >= 1` quando informada, e coerência entre
  `periodicidade_parcelas`, `quantidade_parcelas` e
  `data_primeiro_vencimento`: ou os três estão preenchidos, ou nenhum.
  Parcelamento pela metade gera parcela errada no módulo 7.
- `installments_generated` só pode ser verdadeiro se houver parcelamento
  definido.
- `start_date` não anterior a `signature_date`, quando as duas existem.
- Os cinco `prazo_*`, quando informados, são positivos.
- FK composta `(id, tenant_id)` para `clients`; `unique (id, tenant_id)`
  próprio, porque `projects` e `accounts_receivable` vão apontar para cá.

## Módulo 5 — Projetos (detalhado)

`Project` tem 45 campos, a maior entidade do sistema. Duas decisões abaixo
tiram trabalho do módulo em vez de acrescentar.

### Tabelas

| Tabela | Origem |
|---|---|
| `projects` | `Project`, menos o que foi adiado |
| `tasks` | `Task` |
| `project_checklist_items` | `Project.checklist_etapa` |
| `task_checklist_items` | `Task.checklist_tarefa` |
| `project_land_types` | `Project.terreno_tipo` (array de tag) |
| `project_purposes` | `Project.finalidade_projeto` (array de tag) |

Padrão em todas: `tenant_id`, leitura por colaborador ativo, escrita por
`can_edit_menu`. `projects` e `tasks` usam menus diferentes — `projects` e
`project_flow` — porque são itens separados na sidebar do original.

Cada uma entra em `pattern_tables` e herda as 26 asserções.

### Decisão 1: a geolocalização da obra fica para o módulo 9

`Project` traz oito campos de geo — `obra_lat`, `obra_lng`, `obra_place_id`,
`obra_geocode_status`, `obra_geocode_updated_at`, `obra_pin_manual`,
`obra_pin_updated_by`, `obra_pin_updated_at` — mais `obra_endereco_texto`.

E existe `PropriedadeMapa`, entidade separada, que é o que a tela de mapa
efetivamente consulta (`MapaProjetos.jsx`). Os campos `obra_*` do projeto só
aparecem em `ProjectForm.jsx` e em `components/utils/geocoding.jsx`. São
**dois lugares guardando onde a obra fica**, e o mapa lê o segundo.

Fazer geo agora significa escolher representação — `numeric` solto ou
`geography(Point)` com PostGIS — e depois refazer no módulo 9, ou conviver
com dois formatos. Então os oito campos entram no módulo 9, junto com
`map_properties`, e a decisão de geo é tomada uma vez só.

O que fica no módulo 5: `location`, `city`, `state` e o endereço em texto.
A tela de projeto perde o ajuste de pino até o módulo 9 chegar, marcado com
comentário.

### Decisão 2: o progresso é calculado, não gravado

`progresso_percentual`, `tarefas_total_obrigatorias` e
`tarefas_concluidas_obrigatorias` são colunas do projeto que
`components/utils/projectProgressCalculator.jsx` calcula a partir das
tarefas e grava de volta.

Coluna derivada gravada pela aplicação só está certa enquanto **toda**
mudança de tarefa passar pelo mesmo caminho. Marcar uma tarefa como
concluída por qualquer outra via — importação, correção no painel, tela nova
— deixa o percentual mentindo, e nada acusa. É o mesmo raciocínio que tirou
os campos de deduplicação do CRM da mão do frontend.

Aqui vira **view** (`project_progress`), não coluna. O cálculo é o do
original: percentual pela fase mais avançada das tarefas, mais a contagem de
itens obrigatórios do checklist.

Consequência: o módulo 10 (Painéis) lê a view, não a coluna.

### `project_phase`: um enum, dois usos

Já criado na migration do módulo 3? Não — conferir. `projects.current_phase`
tem um valor a mais que `tasks.phase`: `Finalizado`. Enum único com todos os
valores, e check em `tasks` impedindo `finished`. Mesmo tratamento que
`priority_level` recebeu (`urgent` só em atividade).

### Regra de negócio para o teste próprio

- `contract_id` aponta para `contracts` por FK composta. É a ligação
  invertida: o contrato **não** guarda `project_id`.
- Dois responsáveis distintos, os dois FK composta para `collaborators`.
- `tasks.phase` nunca recebe `finished`.
- `completion_date` só com `status = 'completed'`; e status concluída exige
  data.
- `estimated_hours` e `spent_hours` não negativos.
- `due_date` não anterior a `start_date`, quando as duas existem.
- Item de checklist obrigatório concluído precisa de data de conclusão.
- A view `project_progress` devolve 0 para projeto sem tarefa, e não nulo.

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
