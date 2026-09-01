# De/para dos valores de lista (base44 → Postgres)

> Fonte da verdade da importação. O valor da esquerda é exatamente o que
> está gravado no base44 hoje; o do meio é o valor do enum no Postgres; o da
> direita é o rótulo exibido na UI em português.
>
> Regra: **nada é traduzido no ato da importação por adivinhação**. Valor que
> chegar do base44 e não estiver nesta tabela derruba a importação daquela
> linha e vai para um relatório de pendências — nunca vira `other` no
> silêncio.
>
> **Segunda passada da importação.** O de/para nasceu das declarações `enum`
> das 16 entidades do base44, e o dado real trouxe 14 valores que a operação
> digitou e que nenhuma entidade declara. Isso não é o dado estar errado: é o
> de/para estar incompleto, porque o base44 não valida enum na escrita e o que
> a operação usa no dia a dia é maior do que o que a entidade declara. As
> entradas marcadas **(2ª passada)** abaixo foram acrescentadas com esse
> critério, e cada uma tem escrito **por que aquele destino e não outro** — o
> critério é sempre o significado no domínio, nunca a semelhança de string.
> Onde não existia destino honesto, o valor **não** entrou no de/para e a linha
> continua em pendências.

Cada tabela ganha `legacy_id text` com o id original do base44, e
`unique (tenant_id, legacy_id)`. É por ele que as ligações entre tabelas são
refeitas na importação e que uma reimportação não duplica linha.

---

## Fundação

### `collaborator_role`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Diretor | `director` | Diretor |
| Coordenador | `coordinator` | Coordenador |
| Administrativo | `admin_staff` | Administrativo |
| Financeiro | `finance` | Financeiro |
| Arquiteto | `architect` | Arquiteto |
| Estagiário | `intern` | Estagiário |

### `collaborator_area`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Comercial | `commercial` | Comercial |
| Projetos | `projects` | Projetos |
| Operacional | `operations` | Operacional |
| Administrativo | `administrative` | Administrativo |
| Financeiro | `finance` | Financeiro |

### `collaborator_status`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Ativo | `active` | Ativo |
| Férias | `vacation` | Férias |
| Afastado | `on_leave` | Afastado |

### `access_request_status`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Pendente | `pending` | Pendente |
| Aprovada | `approved` | Aprovada |
| Recusada | `rejected` | Recusada |

### `menus.key` — de/para do texto de `PermissoesUsuario.menu`

Caso especial: o original tem **27 rótulos para 16 menus**, com duplicatas
semânticas e dois valores corrompidos. A importação consolida.

| base44 (texto gravado) | `menu_key` | Rótulo UI |
|---|---|---|
| Visão Geral / Dashboard Geral | `dashboard_overview` | Visão Geral |
| Painel Executivo / Dashboard Executivo | `dashboard_executive` | Painel Executivo |
| Painel Comercial / Dashboard Comercial | `dashboard_commercial` | Painel Comercial |
| CRM / Clientes | `crm` | CRM |
| Pipeline / `Negoциações` (cirílico) / Negociações | `pipeline` | Pipeline |
| Contratos & Propostas / Contratos | `contracts` | Contratos & Propostas |
| Projetos | `projects` | Projetos |
| Mapa de Projetos | `map` | Mapa de Projetos |
| Fluxo do Projeto / Tarefas | `project_flow` | Fluxo do Projeto |
| Atividades | `activities` | Atividades |
| Fornecedores | `suppliers` | Fornecedores |
| Orçamento por Cliente | `client_budget` | Orçamento por Cliente |
| Recebíveis / Contas a Receber | `receivables` | Recebíveis |
| Pagamentos / Contas a Pagar | `payables` | Pagamentos |
| Equipe / Colaboradores | `team` | Equipe |
| Controle de Acesso / `Aprova​ções de Acesso` (zero-width space) | `access_control` | Controle de Acesso |
| — (agrupador, não existe no original) | `financial` | Financeiro |
| — (agrupador, não existe no original) | `team_group` | Equipe |

Os dois agrupadores (`financial` e `team_group`) não têm texto correspondente
no base44 e **nunca recebem linha de permissão**. No `Layout.jsx` original
eles são só estrutura de componente (`subItems`): a sidebar mostra o grupo
quando pelo menos um filho tem `can_view`. `team_group` e `team` têm o mesmo
rótulo "Equipe" no original e são coisas diferentes — o grupo e o item
Colaboradores dentro dele.

Consolidação: quando as duas grafias existirem para o mesmo colaborador com
valores diferentes de `can_view`/`can_edit`, **prevalece o mais restritivo**
(decisão do usuário na etapa de importação), e a linha vai para o relatório de
conflitos para conferência humana. Não há como saber qual das duas o escritório
considera correta — e, quando não se sabe, o erro que não se percebe é o de dar
acesso a mais.

Também aparece `Minhas Atividades` na navegação, mas ela nunca é checada
contra permissão — é liberada por função (Arquiteto, Estagiário,
Coordenador). Não vira linha em `menus`.

---

## CRM

### `lead_source`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Instagram | `instagram` | Instagram |
| Indicação | `referral` | Indicação |
| Site | `website` | Site |
| Outros | `other` | Outros |
| **WhatsApp** (2ª passada) | `other` | Outros |

`WhatsApp` é canal real do escritório e a lista fechada do base44 não o tem.
`other` é o valor que a própria lista oferece para "canal que não está aqui", e
escrito nesta tabela ele deixa de ser um `other` calado — que é o que a regra
proíbe. Um valor `whatsapp` próprio seria migration de enum, e migration com
dado real dentro é decisão do usuário. 1 linha.

### `client_type`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Pessoa Física | `individual` | Pessoa Física |
| Pessoa Jurídica | `company` | Pessoa Jurídica |
| **Lead** / **lead** (2ª passada) | — (nulo) | — |

`Lead` não é tipo de pessoa: é estágio de funil, e o funil já vive em
`negotiations`. A coluna `clients.client_type` aceita nulo, e nulo diz
exatamente o que se sabe dessas 2 linhas — o tipo de pessoa não foi informado.
Escolher `individual` ou `company` seria inventar o documento da pessoa.

---

## Pipeline

### `service_type`

> **Deixou de ser enum na migration 0084.** Os tipos de serviço viraram a tabela
> `service_types`, uma lista por escritório, editável em Configurações — o
> escritório precisa acrescentar tipo sem migration, e enum só cresce por DDL.
> `negotiation_services` guarda `service_type_id`, não mais um valor de enum.
>
> **O de/para abaixo continua valendo, e é ele que a importação usa**: a coluna
> "Postgres" passou a ser a `key` da linha em `service_types` — imutável, ao
> contrário do rótulo, que o escritório pode renomear. Um rótulo do base44 sem
> chave correspondente na tabela do escritório vira pendência de importação, e
> não um tipo criado em silêncio.

| base44 | `service_types.key` | Rótulo UI |
|---|---|---|
| Arquitetura | `architecture` | Arquitetura |
| Interiores | `interiors` | Interiores |
| Estrutura | `structural` | Estrutura |
| Hidrosanitário | `plumbing` | Hidrosanitário |
| Elétrico | `electrical` | Elétrico |
| Consultoria | `consulting` | Consultoria |
| **Projeto de Arquitetura** (2ª passada) | `architecture` | Arquitetura |
| **Complementares** (2ª passada) | — (não vira linha) | — |

`Projeto de Arquitetura` é o rótulo que `Contract` usa para o mesmo conceito —
a mesma unificação de rótulo que a seção Contratos já descreve, agora do lado
do serviço. Na única linha em que aparece, `Arquitetura` também está na lista;
a deduplicação por `(negotiation_id, service_type_id)` resolve.

`Complementares` é o guarda-chuva de Estrutura + Hidrosanitário + Elétrico, e
na única linha em que aparece **os três já estão listados um a um ao lado
dele**. Expandir em três linhas inventaria três serviços onde o escritório
registrou um rótulo; escolher um dos três seria pior. Não vira linha, e o
descarte fica registrado na seção AJUSTES do relatório de importação.

### `negotiation_status`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Ativa | `active` | Ativa |
| Ganha | `won` | Ganha |
| Perdida | `lost` | Perdida |

### `funnel_stage`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Lead recebido | `lead_received` | Lead recebido |
| Qualificado | `qualified` | Qualificado |
| Proposta enviada | `proposal_sent` | Proposta enviada |
| Em negociação | `negotiating` | Em negociação |
| Fechamento | `closing` | Fechamento |

### `lead_origin`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Instagram | `instagram` | Instagram |
| Indicação | `referral` | Indicação |
| Site | `website` | Site |
| Evento | `event` | Evento |
| Outro | `other` | Outro |

### `loss_reason`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Valor | `price` | Valor |
| Prazo | `timeline` | Prazo |
| Escolheu outro escritório | `chose_competitor` | Escolheu outro escritório |
| Vai adiar o projeto | `postponed` | Vai adiar o projeto |
| Não respondeu | `no_response` | Não respondeu |
| Outro | `other` | Outro |

### `client_intake_status`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Ativo | `active` | Ativo |
| Expirado | `expired` | Expirado |
| Enviado | `submitted` | Enviado |

### `client_intake_validation_status`

Não existia neste documento até a migration 0021: no base44,
`ClientIntake.ultimo_status_validacao` é **texto livre**, e os valores abaixo
saem da descrição do campo ("OK, TOKEN_VAZIO, NAO_ENCONTRADO, EXPIRADO,
ENVIADO") mais os dois que o código grava e a descrição não lista (`CRIADO`,
`EXPIRADO_NO_ENVIO`). Virou enum porque é coluna de auditoria, e auditoria em
texto livre acumula grafia divergente até ninguém conseguir agrupar por ela.

| base44 | Postgres | Rótulo UI |
|---|---|---|
| CRIADO | `created` | Link criado |
| OK | `ok` | Link aberto |
| EXPIRADO | `expired` | Link expirado |
| ENVIADO | `already_submitted` | Link já utilizado |
| EXPIRADO_NO_ENVIO | `expired_on_submit` | Expirou antes do envio |
| — | `submitted` | Enviado com sucesso |
| TOKEN_VAZIO | — (não importável) | — |
| NAO_ENCONTRADO | — (não importável) | — |
| **(vazio)** (2ª passada) | `created` | Link criado |

Uma das 42 linhas tem o campo vazio; as outras 41 dizem `CRIADO`. `created` é o
que aconteceu com ela também — o link foi criado e nunca foi aberto.

`TOKEN_VAZIO` e `NAO_ENCONTRADO` descrevem uma tentativa em que **nenhuma
linha foi encontrada**, então não existe linha onde gravá-los — no original
também não: o código lança o erro antes de qualquer `update`. `submitted` não
tem equivalente no base44, onde o sucesso do envio só aparece na mudança de
`status`.

---

## Contratos

### `contract_type` (compartilhado com `projects.project_type`)

| base44 (Contract) | base44 (Project) | Postgres | Rótulo UI |
|---|---|---|---|
| Projeto de Arquitetura | Arquitetura | `architecture` | Arquitetura |
| Projeto de Arquitetura + Complementares | Arquitetura + Complementares | `architecture_engineering` | Arquitetura + Complementares |
| Projeto de Arquitetura + Interiores | Arquitetura + Interiores | `architecture_interiors` | Arquitetura + Interiores |
| Todos | Todos | `full` | Todos |

O rótulo difere entre as duas entidades no original ("Projeto de
Arquitetura" vs "Arquitetura") para o mesmo conceito. A importação unifica.

#### `Project.project_type` com **lista de serviços** (2ª passada)

18 dos 73 projetos não trazem um dos quatro rótulos acima: trazem a lista de
serviços da negociação, serializada com vírgula, em 8 grafias que descrevem 4
conjuntos (as mesmas cinco palavras em ordens diferentes). Não é dado ausente
— é `Negociacao.tipo_servico` no campo errado, e o conjunto que os quatro
valores descrevem está escrito dentro da própria célula.

**Critério (lê o conjunto de serviços, nunca a ordem nem a string):**

| Conjunto de serviços na célula | `project_type` |
|---|---|
| tem Interiores **e** algum complementar (Estrutura/Hidrosanitário/Elétrico) | `full` |
| tem Interiores e **nenhum** complementar | `architecture_interiors` |
| tem complementar e **não** tem Interiores | `architecture_engineering` |
| só Arquitetura | `architecture` |

É a leitura literal dos quatro rótulos do original ("Arquitetura +
Complementares", "Arquitetura + Interiores", "Todos"). Resultado: 8
`architecture_engineering`, 4 `architecture_interiors`, 6 `full`.

**Os demais serviços não se perdem em 15 dos 18.** Esses projetos têm
contrato, o contrato tem negociação, e a lista de serviços daquela negociação
é idêntica à string — ela já entrou item a item em `negotiation_services`. Nos
outros 3 não há contrato nem negociação, e `projects` não tem tabela-filha de
serviço: neles a lista sobrevive só como o tipo escolhido, e o texto original
fica registrado no relatório de importação.

### `billing_type`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Por Fases | `by_phase` | Por Fases |
| Parcelado mensal | `monthly_installments` | Parcelado mensal |
| À vista | `upfront` | À vista |
| % sobre obra | `percent_of_construction` | % sobre obra |

### `contract_status`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Em negociação | `negotiating` | Em negociação |
| Aprovado | `approved` | Aprovado |
| Em execução | `in_progress` | Em execução |
| Concluído | `completed` | Concluído |
| Rescindido | `terminated` | Rescindido |

### `installment_frequency`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Mensal | `monthly` | Mensal |
| Quinzenal | `biweekly` | Quinzenal |
| Semanal | `weekly` | Semanal |
| Única | `single` | Única |

---

## Projetos

### `project_status`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Prospecção | `prospecting` | Prospecção |
| Em contrato | `under_contract` | Em contrato |
| Em desenvolvimento | `in_development` | Em desenvolvimento |
| Em aprovação | `in_approval` | Em aprovação |
| Concluído | `completed` | Concluído |
| Suspenso | `suspended` | Suspenso |

### `project_phase` (compartilhado com `tasks.phase`)

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Não iniciado | `not_started` | Não iniciado |
| Briefing | `briefing` | Briefing |
| Layout | `layout` | Layout |
| Perspectivas | `renderings` | Perspectivas |
| Revisão | `revision` | Revisão |
| Projeto Legal | `legal_permit` | Projeto Legal |
| Aprovação Condomínio | `hoa_approval` | Aprovação Condomínio |
| Projeto Executivo | `construction_docs` | Projeto Executivo |
| Projetos Complementares | `engineering_docs` | Projetos Complementares |
| Alvará de Construção | `building_permit` | Alvará de Construção |
| **Em Obra** (migration 0061) | `under_construction` | Em Obra |
| Aguardando Cliente | `awaiting_client` | Aguardando Cliente |
| Finalizado | `finished` | Finalizado |
| **Estudo preliminar** (migration 0079) | `preliminary_study` | Estudo preliminar |
| **Anteprojeto** (migration 0079) | `preliminary_design` | Anteprojeto |
| **Executivo** (2ª passada) | `construction_docs` | Projeto Executivo |

As três últimas são fases que a operação usa em `Task.phase` e que nenhuma
entidade do base44 declara. O critério é o significado no domínio, conferido
contra o título das tarefas que carregam cada valor:

- **`Estudo preliminar` (18 tarefas) e `Anteprojeto` (3) viraram VALORES
  PRÓPRIOS na migration 0079.** Até então eram dobrados dentro de `layout` e
  `renderings`, pelo significado no domínio (estudo preliminar *é* o estudo de
  layout; na NBR 13532 o anteprojeto ocupa o lugar da perspectiva). O raciocínio
  continua defensável — o que estava errado era a consequência, e ela foi
  **medida**: o quadro do Fluxo mostrava 27 cartões em "Layout" onde a produção
  do escritório mostra 9, e 15 em "Perspectivas" contra 12.

  Duas razões derrubaram a dobra. O banco deixava de guardar o que o base44
  guarda — e a exportação deve ser replicada como está. E as 21 tarefas
  apareciam na coluna errada: são tarefas de ABERTURA de projeto ("Iniciar
  projeto — *cliente*") sentadas na coluna de quem já está desenhando layout,
  numa tela que a equipe lê como "onde o trabalho está".

  As duas fases **não têm coluna no kanban**, por decisão do usuário — então as
  tarefas nelas não aparecem no quadro, exatamente como na produção, cujo kanban
  casa a fase por texto exato (`task.phase === column.id`) e não tem coluna para
  nenhuma das duas. Nem percentual na escala de progresso, pelo mesmo motivo:
  `FASE_PERCENTUAIS` da produção não as lista.
- **`Executivo` (1 tarefa) → `construction_docs`.** Forma curta de Projeto
  Executivo. A tarefa é "Compatibilização estrutural", que só existe no
  executivo.

**`Em Obra` (14 tarefas) virou valor novo, na migration 0061.** É fase de obra,
depois da aprovação, e nenhum dos 13 valores anteriores significava isso:
`Alvará de Construção` é o alvará, não a obra, e `Pós-aprovação` — que seria o
equivalente — é barrado em `tasks` pelo check `tasks_phase_no_post_approval`.
Traduzir seria adivinhar; acrescentar é aditivo e não muda nenhuma linha
existente. `under_construction` entrou **depois de `building_permit`**, que é a
posição dela no kanban, e vale para tarefa e para projeto. Ela **não tem
percentual próprio** na view `project_progress`: cai no `NULL` do `CASE` e é
ignorada no `max()`, exatamente como `awaiting_client` — inventar um percentual
mudaria o número exibido de 14 projetos com base em palpite.

O frontend ainda precisa de duas coisas para ela aparecer: o rótulo em
`PROJECT_PHASE` (`src/lib/enums.ts`) e a coluna no kanban de tarefas
(`COLUMNS` em `TaskKanban.tsx`, hoje uma lista fixa de doze). Sem a coluna, a
tarefa não aparece em coluna nenhuma do Fluxo do Projeto.

`Finalizado` só existe em `Project.fase_projeto_atual`; `Task.phase` não tem
esse valor. O enum é único e `tasks` simplesmente nunca recebe `finished` —
garantido por check na tabela.

### `geocode_status`

| base44 | Postgres |
|---|---|
| PENDING | `pending` |
| OK | `ok` |
| FAILED | `failed` |

Criado na migration 0056 (módulo 9), não na 0031: os oito campos `obra_*` de
`Project` foram adiados junto com `map_properties`, e criar o tipo antes da
coluna seria deixar tipo sem dono. Vive em `projects.site_geocode_status`
(`obra_geocode_status` no original), `not null default 'pending'`.

Há um quarto estado no original que a entidade não declara: `ProjectForm.jsx:62`
inicializa o campo com **string vazia**, e o base44 aceita. Na importação, string
vazia é `pending` — significam a mesma coisa ("ainda não foi geocodificado") e
`pending` nunca é escrito por nenhuma tela, só é default.

---

## Tarefas e atividades

### `task_priority`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Alta | `high` | Alta |
| Média | `medium` | Média |
| Baixa | `low` | Baixa |

### `activity_priority`

Igual ao anterior, mais um valor. `Atividade` tem `Urgente`, `Task` não.

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Baixa | `low` | Baixa |
| Média | `medium` | Média |
| Alta | `high` | Alta |
| Urgente | `urgent` | Urgente |

Enum único `priority_level` com os quatro valores; `tasks` nunca recebe
`urgent`, garantido por check.

### `work_status` (compartilhado por `tasks` e `activities`)

| base44 (Task) | base44 (Atividade) | Postgres | Rótulo UI |
|---|---|---|---|
| Não iniciado | Não iniciada | `not_started` | Não iniciada |
| Em andamento | Em andamento | `in_progress` | Em andamento |
| Concluída | Concluída | `completed` | Concluída |
| **A fazer** (2ª passada) | — | `not_started` | Não iniciada |
| **Em revisão** (2ª passada) | — | `in_progress` | Em andamento |
| **Em espera cliente** (2ª passada) | — | `in_progress` | Em andamento |

Diferença de gênero no rótulo ("Não iniciado" vs "Não iniciada") some no
enum e a UI passa a usar uma forma só.

Os três valores da 2ª passada são de `Task.status` e o enum tem três estados —
cada um cai em um deles sem ambiguidade. `A fazer` é a fazer, ou seja, ainda
não começou. `Em revisão` e `Em espera cliente` são trabalho **já em curso e
ainda não concluído**: nenhum dos dois é "não iniciada" e nenhum é "concluída".

O que se perde **nesta coluna**: a noção de "parada esperando alguém". Ela
existe no dado em `Task.tag_operacional` (13 tarefas, valores `Em Revisão` e
`Aguardando Cliente` — exatamente os mesmos dois estados), campo que o base44
nunca declarou. Ela deixou de se perder no banco: a migration `0074` criou
`tasks.operational_tag` e as 13 tags entram pelo próprio passo 17 da
importação (ver `operational_tag`, mais abaixo). O que continua sendo tradução
com perda é só o `status` destas duas linhas — `in_progress` não diz que a
tarefa está parada, e quem diz isso agora é a coluna ao lado.

### `task_type`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Técnica | `technical` | Técnica |
| Reunião | `meeting` | Reunião |
| Revisão | `review` | Revisão |
| Administrativo | `administrative` | Administrativo |

---

## Financeiro

### `financial_status`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Previsto | `forecast` | Previsto |
| Pago | `paid` | Pago |
| Negociado | `renegotiated` | Negociado |
| Em atraso | — | Em atraso |

**`Em atraso` não vira valor do enum.** É calculado: `forecast` com
vencimento no passado. Linha que chegar da importação com esse status é
gravada como `forecast` — a tela mostra "Em atraso" sozinha, sem ninguém
precisar rodar rotina diária.

### `payment_method`

| base44 | Postgres | Rótulo UI | Onde aparece |
|---|---|---|---|
| PIX | `pix` | PIX | ambos |
| Boleto | `boleto` | Boleto | ambos |
| Cartão | `card` | Cartão | ambos |
| TED | `ted` | TED | ambos |
| Espécie | `cash` | Espécie | só a receber |
| Débito automático | `direct_debit` | Débito automático | só a pagar |

Enum único com os seis valores. O formulário de cada tela oferece só os seus.

### `expense_category`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Folha | `payroll` | Folha |
| Impostos | `taxes` | Impostos |
| Escritório | `office` | Escritório |
| Softwares | `software` | Softwares |
| Marketing | `marketing` | Marketing |
| Viagens | `travel` | Viagens |
| Prestadores | `contractors` | Prestadores |
| Materiais | `materials` | Materiais |
| Equipamentos | `equipment` | Equipamentos |
| Outros | `other` | Outros |

### `recurrence_frequency`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Mensal | `monthly` | Mensal |
| Bimestral | `bimonthly` | Bimestral |
| Trimestral | `quarterly` | Trimestral |
| Semestral | `semiannual` | Semestral |
| Anual | `annual` | Anual |

### `recurrence_status`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Ativa | `active` | Ativa |
| Pausada | `paused` | Pausada |
| Encerrada | `ended` | Encerrada |

### `financial_category_type`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Receita | `revenue` | Receita |
| Despesa | `expense` | Despesa |

### `cost_center`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Arquitetura | `architecture` | Arquitetura |
| Interiores | `interiors` | Interiores |
| Obra | `construction` | Obra |
| Mentoria | `mentoring` | Mentoria |
| Administrativo | `administrative` | Administrativo |

---

## Fornecedores

### `supplier_category`

**Um enum, dois usos** (migration 0048). O base44 tem duas listas fechadas para
a mesma ideia — `Fornecedor.tipologia` (19 valores) e
`ChecklistOrcamento.itens[].categoria` (20 valores) — e elas não batem. Pior:
`ItemOrcamentoForm.jsx` oferece uma **terceira** lista, com 23 valores (a união
das duas), ou seja, o formulário oferece quatro categorias que a entidade
recusa.

Isso importa porque a tela sugere fornecedor comparando os dois campos entre si
(`f.tipologia === form.categoria`). Aqui é **um tipo** com os 23 valores, na
ordem em que o formulário de item os exibe, compartilhado por
`suppliers.category` e `budget_checklist_items.category`. Os quatro marcados
com † **só valem para item de orçamento** — `suppliers.category` os barra por
check, como `tasks.phase` barra `finished`.

Consequência herdada, e não corrigida: item de categoria `Impermeabilização`
nunca terá fornecedor sugerido, porque fornecedor nenhum pode ter essa
tipologia.

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Cerâmica e Porcelanato | `ceramics_porcelain` | Cerâmica e Porcelanato |
| Metais e Louças | `fixtures_sanitaryware` | Metais e Louças |
| Pedras Naturais | `natural_stone` | Pedras Naturais |
| Iluminação Interna | `indoor_lighting` | Iluminação Interna |
| Iluminação Externa e Paisagismo | `outdoor_lighting` | Iluminação Externa e Paisagismo |
| Esquadrias | `frames_openings` | Esquadrias |
| † Revestimento de Fachada | `facade_cladding` | Revestimento de Fachada |
| † Revestimento de Piscina | `pool_cladding` | Revestimento de Piscina |
| Automação Residencial | `home_automation` | Automação Residencial |
| Energia Solar | `solar_energy` | Energia Solar |
| Tintas e Texturas | `paint_texture` | Tintas e Texturas |
| Paisagismo | `landscaping` | Paisagismo |
| Marcenaria | `cabinetry` | Marcenaria |
| Madeira | `wood` | Madeira |
| Estrutura e Fundação | `structure_foundation` | Estrutura e Fundação |
| † Impermeabilização | `waterproofing` | Impermeabilização |
| † Gesso e Drywall | `drywall_plaster` | Gesso e Drywall |
| Elétrica e Hidráulica | `electrical_plumbing` | Elétrica e Hidráulica |
| Climatização | `hvac` | Climatização |
| Vidros e Espelhos | `glass_mirrors` | Vidros e Espelhos |
| Elevadores | `elevators` | Elevadores |
| Bombas e Filtros de Piscina | `pool_equipment` | Bombas e Filtros de Piscina |
| Outros | `other` | Outros |

### `partnership_model`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Comissão sobre venda | `sales_commission` | Comissão sobre venda |
| Desconto no preço | `price_discount` | Desconto no preço |
| Comissão + Desconto | `commission_and_discount` | Comissão + Desconto |
| Exclusividade de especificação | `spec_exclusivity` | Exclusividade de especificação |
| Sem parceria formal | `none` | Sem parceria formal |

### `commission_payment_term`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Na entrega do material | `on_delivery` | Na entrega do material |
| 30 dias após entrega | `net_30_after_delivery` | 30 dias após entrega |
| 60 dias após entrega | `net_60_after_delivery` | 60 dias após entrega |
| Após pagamento do cliente | `after_client_payment` | Após pagamento do cliente |
| A combinar | `to_be_agreed` | A combinar |

### `partnership_tier`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Estratégico | `strategic` | Estratégico |
| Preferencial | `preferred` | Preferencial |
| Cadastrado | `registered` | Cadastrado |
| Em avaliação | `under_evaluation` | Em avaliação |

### `supplier_status`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Ativo | `active` | Ativo |
| Inativo | `inactive` | Inativo |
| Em negociação | `negotiating` | Em negociação |

---

## Orçamento

### `budget_checklist_status`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Aberto | `open` | Aberto |
| Em andamento | `in_progress` | Em andamento |
| Aguardando cliente | `awaiting_client` | Aguardando cliente |
| Concluído | `completed` | Concluído |
| Cancelado | `cancelled` | Cancelado |

### `budget_item_status`

Não existia neste documento até a migration 0048. São os seis valores de
`ChecklistOrcamento.itens[].status_item`, repetidos em `ItemOrcamentoForm.jsx`
e no mapa de cores de `ChecklistDetalhe.jsx`.

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Pendente | `pending` | Pendente |
| Em cotação | `quoting` | Em cotação |
| Cotado | `quoted` | Cotado |
| Apresentado ao cliente | `presented_to_client` | Apresentado ao cliente |
| Aprovado | `approved` | Aprovado |
| Cancelado | `cancelled` | Cancelado |

É ele, e não o campo `concluido` da entidade, que mede o progresso do
checklist: `approved` e `cancelled` contam como finalizados. `concluido` é
bandeira duplicada que nenhuma tela lê ou escreve, e **não foi portado**.

### Categoria do item de orçamento

Não gera enum próprio: é `supplier_category`, o mesmo tipo do fornecedor — ver
a seção "Fornecedores" acima, inclusive os quatro valores que só valem aqui.

### `priority_level` no item de orçamento

`ChecklistOrcamento.itens[].prioridade` (Urgente, Alta, Média, Baixa) reusa o
enum `priority_level` da migration 0031, com os quatro valores. Sem tipo novo.

### `ChecklistOrcamento.fase_projeto`

Subconjunto de `project_phase`. Não gera enum próprio.

| base44 | Postgres |
|---|---|
| Perspectivas | `renderings` |
| Projeto Executivo | `construction_docs` |
| Projetos Complementares | `engineering_docs` |
| Pós-aprovação | `post_approval` |

`Pós-aprovação` não existe em `project_phase` — foi adicionado ao enum
compartilhado na migration 0048 e nunca é usado por `projects` nem por `tasks`.
"Nunca é usado" virou check nas duas tabelas (migration 0049): enum
compartilhado sem check é enum que vaza, e `post_approval` não tem percentual na
view `project_progress` nem coluna no kanban do original.

---

## Mapa

### `map_visual_status`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Não iniciado | `not_started` | Não iniciado |
| Em desenvolvimento | `in_development` | Em desenvolvimento |
| Pausado | `paused` | Pausado |
| Concluído | `completed` | Concluído |
| **Em andamento** (2ª passada) | `in_development` | Em desenvolvimento |

`Em andamento` aparece em 1 pino. Dentro dos quatro estados deste enum (não
iniciado / em desenvolvimento / pausado / concluído) "em andamento" só pode ser
o segundo. A grafia veio emprestada de `project_status`, que é enum vizinho e
propositalmente diferente — o significado, dentro desta lista, não é ambíguo.

Repare que não é igual a `project_status` (`Em desenvolvimento` e
`Concluído` coincidem, `Pausado` vs `Suspenso` não). Enum separado, de
propósito — é um status visual do marcador no mapa, não o status do projeto.

Criado na migration 0056. Vive em `map_properties.visual_status`, `not null
default 'not_started'`. Só é lido quando o pino **não** tem projeto vinculado —
quando tem, a tela usa o status do projeto (`MapaProjetos.jsx:287`). A coluna é
gravada nos dois casos, como no original.

### Os dois campos de array de `PropriedadeMapa` não viraram enum

`terreno_tipo` e `finalidade_projeto` são array de string no base44, e **não
entram neste de/para**: o formulário sugere três e quatro valores
respectivamente, e tem um campo "Nova categoria..." que aceita qualquer texto
digitado (`ProjectForm.jsx:270` e `:289`). Viraram tabela-filha de texto livre
(`map_property_land_types`, `map_property_purposes`, migration 0057), como a
0032 já tinha feito com os mesmos dois campos em `Project`.

---

## Diário do Projeto (módulo 11)

Origem: `nova-versao/base44/entities/ProjectTimelineEntry.jsonc`. É a
exportação mais recente do **mesmo** base44, e a entidade não existe em
`projeto-original/` — o escritório criou o Diário do Projeto depois do ponto
em que esta migração começou. As três listas abaixo saem das declarações
`enum` da entidade, e **não** do que as 36 linhas reais por acaso trazem: o
dado usa 4 dos 10 tipos e 2 dos 3 status, e um de/para escrito só pelo dado
real recusaria em silêncio a primeira linha que usasse um dos outros.

### `diary_entry_type`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Solicitação do Cliente | `client_request` | Solicitação do Cliente |
| Alteração de Projeto | `project_change` | Alteração de Projeto |
| Decisão | `decision` | Decisão |
| Reunião | `meeting` | Reunião |
| Aprovação | `approval` | Aprovação |
| Correção | `correction` | Correção |
| Entrega | `delivery` | Entrega |
| Observação | `note` | Observação |
| Outro | `other` | Outro |
| Sistema | `system` | Sistema |

`Sistema` é reservado ao registro **automático**: no dado real os dois andam
sempre juntos (31 de 31 linhas), e a migration 0069 transformou isso em check
(`(entry_type = 'system') = is_automatic`).

### `diary_entry_status`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Em andamento | `in_progress` | Em andamento |
| Concluído | `completed` | Concluído |
| Cancelado | `cancelled` | Cancelado |

Não reusa `work_status` (0031): aquele não tem `cancelled` e tem
`not_started`, que não existe aqui. Dois domínios parecidos e diferentes.

### `diary_system_event` — a chave é o **prefixo** de `evento_chave`

Este é o único de/para deste documento cuja chave não é um valor de lista. No
base44 a natureza do evento automático não existe como campo: ela vive como
prefixo de texto dentro de `evento_chave`
(`fase:<project_id>:<Date.now()>`) e como palavra dentro do título.

| prefixo em `evento_chave` | Postgres | Linhas reais |
|---|---|---|
| `fase:` | `phase_change` | 11 |
| `responsavel:` | `responsible_change` | 2 |
| `tag-on:` | `tag_on` | 12 |
| `tag-off:` | `tag_off` | 4 |
| `relatorio:` | `report_generated` | 2 |

Determinístico, 31 de 31. O prefixo **foi escrito** pelo código que gravou o
evento, um por gesto — não é adivinhação sobre texto livre. O enum tem ainda
`site_visit`, `issue_created` e `issue_resolved`, que nascem nas abas de obra
e não têm linha no export.

**O que NÃO é lido do texto, e é a diferença que importa:** a fase. Onze
títulos dizem "Projeto movido de Perspectivas → Layout" e `from_phase`/
`to_phase` mesmo assim ficam **nulos** nas 36 linhas importadas. Ler rótulo em
português de dentro de texto livre é exatamente a heurística que o módulo 11
existe para eliminar (defeito 10 do plano); fazê-lo na importação plantaria o
defeito no dado histórico.

### `operational_tag`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Em Revisão | `in_review` | Em Revisão |
| Aguardando Cliente | `awaiting_client` | Aguardando Cliente |

Criado na migration `0068` e compartilhado por `project_diary_entries` e
`tasks.operational_tag` (esta última criada pela `0074`, fatia 3).

**Não é usado pela importação das 36 linhas do diário**: no base44 a tag só
aparece dentro do título ("Marcado como Em Revisão"), e vale aqui a mesma regra
da fase — rótulo lido de dentro de texto livre não vira coluna.

**É usado pela importação das tarefas.** As 13 tags reais vêm de
`Task.tag_operacional`, no passo 17: `Em Revisão` em 7 tarefas e `Aguardando
Cliente` em 6, distribuídas em Layout (4), Perspectivas (5), Projeto Executivo
(3) e Projeto Legal (1). São os **dois únicos** valores preenchidos no export —
não há terceiro, e valor fora deste de/para derruba a tarefa para pendências
como em qualquer outro enum.

Célula vazia (117 das 130 tarefas) **não vira `null` no payload**: a coluna é
omitida. O `upsert` é por `(tenant_id, legacy_id)` e chave ausente não entra no
`SET` do `UPDATE`, então reexecutar a importação não apaga a tag que alguém
tenha marcado pela tela. Mesma regra das quatro colunas que o passo 31 deixa de
fora.

---

## O que a 2ª passada NÃO acrescentou, e o que as migrations 0061–0066 resolveram

Quatro casos ficaram de fora do de/para de propósito, porque entrar exigia
**migration**. As migrations existem desde 2026-08-06, e a **3ª passada** da
importação afrouxou junto os guardas de `scripts/import-base44.mjs`, que
espelhavam os checks antigos. Os quatro estão resolvidos no banco **e no
script**: as linhas estão importadas.

| Caso | Linhas | Como ficou |
|---|---|---|
| `Task.phase` = `Em Obra` | 14 | **Migration 0061**: `under_construction` entrou em `project_phase`, depois de `building_permit`. Aditivo — os recortes de `tasks` (`finished`, `post_approval`) continuam valendo. |
| `Fornecedor.tipologia` = `Revestimento de Fachada` | 1 (+ 2 marcas) | **Migration 0063**: `suppliers_category_domain_check` passou a aceitar os quatro valores de item **só em linha com `legacy_id`**. A tipologia é real e conhecida; trocá-la por `other` apagaria um fato. |
| Status "concluído/pago" **sem data** | 15 recebíveis, 2 pagáveis, 9 atividades (+1 reaberta), 1 tarefa | **Migration 0062**: os quatro checks `*_matches_status` passaram a ser `check (X or legacy_id is not null)`. Nulo significa "aconteceu, e o quando não foi registrado", como na `0060`. Para linha nascida na tela, a regra é a de sempre. |
| Atividade excluída sem autor da exclusão | 1 | **Migration 0063**: mesma forma. Inventar o autor atribuiria a alguém um ato que ele pode não ter praticado. |

O de/para em si não muda por nada disso, com uma exceção: `Em Obra`, que agora
tem valor (ver `project_phase`, acima).

`Fornecedor.tipologia` **vazia** (1 linha) é caso diferente e entrou: `category`
é NOT NULL, `other`/"Outros" é o valor que a própria lista do base44 oferece
para fornecedor sem classificação (dois fornecedores já o usam), e ele não
afirma categoria nenhuma — só registra que não há uma.

---

## Onde este de/para vive no código

Duas cópias, e é preciso que não divirjam:

1. `src/lib/enums.ts` — valor do enum → rótulo em português, usado por toda
   a UI. É a única fonte de rótulo; nenhuma tela escreve "Em andamento"
   à mão.
2. `scripts/import/enum-map.ts` — texto do base44 → valor do enum, usado só
   na importação. Descartável depois que a importação terminar.

Os valores do enum em si nascem da migration. O teste que garante a
consistência: para cada enum do banco, `src/lib/enums.ts` precisa ter rótulo
para todos os valores — falta de rótulo quebra o build, não a tela em
produção.
