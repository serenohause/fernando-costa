# Plano de importação do dado real do base44

> Levantamento feito **antes** de tocar no banco. Nada foi gravado. O script
> que produz todos os números deste documento é `scripts/analyze-import.mjs`
> — ele só lê os CSV e imprime; não abre conexão com o Postgres.
>
> ```
> node scripts/analyze-import.mjs db
> ```
>
> Os CSV vivem em `db/`, que está no `.gitignore` e tem **dado real de
> cliente** (CPF/CNPJ, endereço, telefone, valor de contrato, coordenada de
> residência). Este documento é versionado: só entra contagem e valor de
> enum. Nome, documento e endereço não aparecem aqui e não devem aparecer.

---

## Resumo executivo

17 arquivos, **2.214 linhas** de entidade principal, mais 1.704 itens de
checklist dentro de `Task`, 247 serviços dentro de `Negociacao`, 436 itens de
tipo/finalidade dentro de `PropriedadeMapa`, 67 marcas dentro de `Fornecedor`
e 19 itens de orçamento dentro de `ChecklistOrcamento`.

**Trava a importação (precisa de decisão humana antes de qualquer `insert`):**

| # | O quê | Linhas |
|---|---|---|
| 1 | ~~`Task.checklist_tarefa`: item obrigatório e concluído sem data~~ **DECIDIDO: entra sem data (migration `0060`)** | 1.178 itens |
| 2 | `PermissoesUsuario` de colaborador que não está no export de `Collaborator` | 94 |
| 3 | `Task`: `phase` e `status` com valor fora do de/para, projeto órfão, responsável órfão | 74 |
| 4 | `ClientIntake`: cliente órfão (18, e `client_id` é NOT NULL) e negociação órfã (21) | 39 |
| 5 | `SolicitacaoAcesso.aprovado_por_id` não é `Collaborator.id` em nenhuma das 22 linhas | 22 |
| 6 | `Project.project_type`: 18 linhas trazem uma **lista de serviços**, não um tipo de contrato | 21 |
| 7 | `AccountReceivable`: `payment_date` x `status` incoerentes (15), valor zero (4) | 19 |
| 8 | `Negociacao.responsavel_comercial_id` órfão — e `commercial_owner_id` é NOT NULL | 15 |
| 9 | `Atividade`: `completed_at` x `status` incoerentes (10), exclusão sem autor (1), colaborador órfão (1) | 12 |
| 10 | `Contract`: plano de parcelamento incompleto (6), prazo de fase igual a zero (2) | 8 |
| 11 | `Client`: `client_type`/`lead_source` fora do de/para (3), cidade/UF vazias (1), CPF repetido (3) | 7 |
| 12 | `AccountPayable`: pagamento incoerente (2), recorrência sem plano (2), fim antes do início (3) | 7 |
| 13 | `Negociacao.tipo_servico` com valor fora do de/para | 2 |
| 14 | `Fornecedor.tipologia` vazia (1) e tipologia que o check de `suppliers` barra (1) | 2 |
| 15 | `PropriedadeMapa.status_visual` = `Em andamento`, fora do de/para | 1 |

Uma linha pode aparecer em mais de um motivo. O total não é a soma.

**Entra sem intervenção:** 122 clientes menos as pendências, 69 contratos, 253
propriedades no mapa, 497 contas a pagar, 279 recebíveis, 37 fornecedores,
6 categorias financeiras, 7 checklists de orçamento com 19 itens, 15
colaboradores.

**Não entra por decisão já registrada:** `Collaborator.senha_temporaria`
(fora de escopo) e `ProjectTimelineEntry` (36 linhas, nenhuma tabela).

**A descoberta que muda o entendimento do de/para:** `docs/ENUM-MAP.md` está
correto. Ele foi escrito a partir das declarações `enum` das 16 entidades do
base44 (`projeto-original/base44/entities/*.jsonc`), e todos os valores que
o CSV traz e o de/para não tem **também violam a declaração da própria
entidade do base44**. `Task.jsonc` declara 11 fases; o dado tem 12.
`Client.jsonc` declara dois tipos de cliente; o dado tem quatro. O base44
não valida enum na escrita. Não é lacuna de mapeamento — é dado fora do
schema de origem, e cada valor precisa de uma decisão do escritório.

---

## 1. De/para tabela por tabela

Convenções que valem para todos os arquivos e não se repetem nas tabelas
abaixo:

| Coluna do base44 | Destino |
|---|---|
| `id` | `legacy_id` (é por ele que as ligações são refeitas) |
| `created_date` | `created_at` |
| `updated_date` | `updated_at` |
| `created_by`, `created_by_id` | **descartadas** — identidade da plataforma base44, não do escritório. 21 valores distintos em todo o export, 7 deles sem `Collaborator` correspondente |
| `is_sample` | **descartada** — `false` em 100% das 2.001 linhas |
| `*_name` ao lado de um `*_id` | **descartada**, vira join pelo `legacy_id`, salvo os snapshots intencionais listados em `docs/SCHEMA-PLAN.md` |
| `tenant_id` | não existe na origem — preenchido com o tenant real no `insert` |

### 1.1 `Collaborator` (15) → `collaborators`

| base44 | nosso | Observação |
|---|---|---|
| `name` | `name` | 2 dos 15 têm espaço nas pontas; `btrim` muda o valor |
| `role` | `role` | 4 valores, todos mapeados |
| `area` | `area` | 3 valores, todos mapeados |
| `email` | `email` | 15 distintos, sem colisão com a unique `(tenant_id, email)` |
| `status` | `status` | só `Ativo` |
| `coordenador_id` | `coordinator_id` | **100% vazio** |
| `weekly_hours` | `weekly_hours` | **100% vazio** |
| `senha_temporaria` | — | **fora de escopo** (ver seção 7.2) |
| `user_auth_email` | — | **100% vazio** (ver seção 7.3) |
| — | `user_id` | **sem fonte.** Só é preenchido quando a pessoa aceita o convite do Supabase Auth |

Sem pendência. As 15 linhas entram.

### 1.2 `PermissoesUsuario` (357) → `collaborator_permissions`

| base44 | nosso |
|---|---|
| `colaborador_id` | `collaborator_id`, por `legacy_id` |
| `menu` (texto livre, 27 rótulos) | `menu_key` (16 chaves), pelo de/para `menus.key` |
| `pode_visualizar` | `can_view` |
| `pode_editar` | `can_edit` |

Os 27 rótulos estão todos no de/para, inclusive os dois corrompidos. Detalhe
na seção 6.

### 1.3 `SolicitacaoAcesso` (22) → `access_requests`

| base44 | nosso | Observação |
|---|---|---|
| `nome` | `name` | é o **local part do e-mail**, não o nome da pessoa |
| `email` | `email` | 20 distintos em 22 linhas — 2 e-mails repetidos |
| `status` | `status` | só `Aprovada` |
| `data_solicitacao` | `requested_at` | |
| `ultima_tentativa` | `last_attempt_at` | |
| `tentativas` | `attempts` | |
| `origem` | `source` | só `login` |
| `aprovado_por_id` | `decided_by` | **22 de 22 órfãos** (seção 3) |
| `data_decisao` | `decided_at` | |

### 1.4 `Client` (122) → `clients`

| base44 | nosso | Observação |
|---|---|---|
| `name`, `phone`, `email`, `notes`, `birth_date` | idem | `phone` preenchido em 122/122; `birth_date` em 68 |
| `cpf_cnpj` | `tax_id` | 75 preenchidos; 1 com 10 dígitos (nem CPF nem CNPJ) |
| `client_type` | `client_type` | 2 linhas com valor fora do de/para |
| `lead_source` | `lead_source` | 1 linha com valor fora do de/para |
| `current_zipcode/address/number/neighborhood/complement/city/state` | `address_*` | `address_city` e `address_state` são **NOT NULL**: 1 linha vazia nos dois |
| `country` | `address_country` | 95 vazios → default `Brasil`. Os 27 preenchidos incluem `Angola` e `Suriname` |
| `construction_*` | `site_*` | todos nullable, como no original |
| `email_norm`, `cpf_cnpj_norm`, `cliente_key` | — | **descartadas**: são colunas geradas no nosso schema (`email_normalized`, `tax_id_digits`, `client_key`) |

### 1.5 `Negociacao` (113) → `negotiations` + `negotiation_services` + `negotiation_owner_history`

| base44 | nosso | Observação |
|---|---|---|
| `nome_negociacao` | `name` | |
| `cliente_id` | `client_id` | 2 órfãos |
| `responsavel_comercial_id` | `commercial_owner_id` | **NOT NULL**, 15 órfãos |
| `valor_estimado` | `estimated_value` | 1 linha com valor abaixo de mil (provável erro de digitação, não viola check) |
| `probabilidade_fechamento` | `close_probability` | 0..100, tudo dentro da faixa |
| `status_negociacao` | `status` | |
| `etapa_funil` | `funnel_stage` | |
| `origem` | `origin` | |
| `nome_indicador` | `referrer_name` | |
| `data_entrada_funil` | `funnel_entry_date` | **NOT NULL**, 1 vazio → default `current_date` |
| `previsao_fechamento` | `expected_close_date` | |
| `data_fechamento` | `closed_at` | nenhuma linha `Ativa` com data — o check passa |
| `motivo_perda`, `observacoes_perda` | `loss_reason`, `loss_notes` | 1 linha com motivo/observação e status diferente de `Perdida` |
| `gera_contrato` | `generates_contract` | |
| `tipo_servico` (array JSON) | `negotiation_services`, uma linha por serviço | 247 serviços; 2 fora do de/para |
| `historico_responsavel` (array JSON) | `negotiation_owner_history` | **1 item em 113 linhas** |
| `contrato_vinculado_id` | `contracts.negotiation_id` (lado oposto) | 66 batem, 10 órfãos, 37 vazios |
| `contrato_vinculado_number` | — | **descartada.** Usa `CTR-<timestamp>`; `Contract.contract_number` usa sequencial de 4 dígitos. **Zero** dos 76 batem |
| `projeto_vinculado_id` | — | **descartada.** A ligação projeto↔negociação não existe no nosso schema; ela passa por `contracts` |
| `cliente_cidade`, `cliente_estado` | — | descartadas, vêm do join com `clients` |

### 1.6 `ClientIntake` (42) → `client_intakes`

25 das 42 colunas estão **100% vazias**: nenhum formulário foi preenchido.
Todas as 42 linhas são links criados e nunca abertos (`ultimo_status_validacao`
= `CRIADO` em 41, vazio em 1).

| base44 | nosso | Observação |
|---|---|---|
| `token` | `token` | **incompatível.** Nossa coluna é `uuid`; o base44 usa `<timestamp>-<sufixo>`. 42 de 42 não são UUID |
| `cliente_crm_id` | `client_id` | **NOT NULL**, 18 órfãos |
| `negociacao_id` | `negotiation_id` | 21 órfãos |
| `status` | `status` | só `Ativo`, mas os 42 já expiraram |
| `criado_em` | `created_at` | |
| `expira_em` | `expires_at` | |
| `ultimo_status_validacao` | `last_validation_status` | |
| `link_publico` | — | **descartada.** URL de `fernandocostaoffice.com`, domínio do original |
| `pais` | `country` | só `Brasil` |
| as 25 colunas de dados do formulário | `full_name`, `phone`, `address_*`, `site_*`… | **sem dado nenhum para migrar** |

### 1.7 `Contract` (69) → `contracts`

| base44 | nosso | Observação |
|---|---|---|
| `contract_number` | `contract_number` | 69 distintos, unique passa |
| `contract_type`, `billing_type`, `status` | idem | `status` = `Aprovado` nas 69 |
| `total_value` | `total_value` | |
| `client_id` | `client_id` | zero órfãos |
| — | `negotiation_id` | vem do lado oposto (`Negociacao.contrato_vinculado_id`): 66 batem, 3 contratos sem negociação |
| `project_name` | `project_name` | snapshot, fica |
| `signature_date`, `start_date`, `notes` | idem | |
| `quantidade_parcelas`, `data_primeiro_vencimento`, `periodicidade_parcelas` | `installment_count`, `first_due_date`, `installment_frequency` | check *all-or-none*: **6 linhas** têm 1 ou 2 dos 3 |
| `installments_generated` | `installments_generated` | 2 linhas marcadas sem plano de parcela |
| `prazo_*` (5) | `layout_study_days`, `renderings_days`, `legal_permit_days`, `construction_docs_days`, `engineering_docs_days` | check `> 0`: **2 linhas** com prazo zero |
| `client_full_name`, `client_cpf_cnpj`, `client_birth_date`, `client_email`, `client_cep/endereco/numero/complemento/cidade/estado` | `client_legal_name`, `client_tax_id`, `client_birth_date`, `client_email`, `client_address_*` | **cópia congelada intencional.** 7 dos 69 divergem do cadastro atual do cliente — é o comportamento esperado |
| `local_*` | `site_*` | segunda cópia congelada |
| `origem_lead`, `nome_indicador` | `origin`, `referrer_name` | |
| `file_url` | — | **não portado** por decisão (`SCHEMA-PLAN`); **100% vazio** de qualquer forma |
| — | `display_order` | sem fonte no export de `Contract` |

### 1.8 `Project` (73) → `projects` (+ tabelas-filhas, todas vazias)

| base44 | nosso | Observação |
|---|---|---|
| `name` | `name` | |
| `project_type` | `project_type` | **NOT NULL**; 18 linhas trazem lista de serviços separada por vírgula (seção 2) |
| `client_id` | `client_id` | 3 órfãos |
| `contract_id` | `contract_id` | zero órfãos; 4 projetos sem contrato |
| `status`, `fase_projeto_atual` | `status`, `current_phase` | |
| `city`, `state` | `city`, `state` | |
| `responsible_id` | `operational_responsible_id` | 67 vazios, 2 órfãos |
| `commercial_responsible_id` | `commercial_responsible_id` | 58 vazios, zero órfãos |
| `start_date`, `total_value` | idem | 13 projetos com valor zero (não viola: o check é `>= 0`) |
| `visivel_em_projetos` | `visible_in_list` | |
| `ordem_exibicao` | `display_order` | 26 preenchidos |
| `prazo_*` (5) | os cinco `*_days` | nenhum zero |
| `progresso_percentual`, `tarefas_total_obrigatorias`, `tarefas_concluidas_obrigatorias` | — | **descartadas por decisão**: são derivadas, vivem na view `project_progress` |
| `obra_lat/lng/place_id/geocode_updated_at/pin_manual/pin_updated_by/pin_updated_at` | `site_lat/lng/place_id/...` | **100% vazias**, exceto `obra_geocode_status` = `PENDING` em 69 e `obra_pin_manual` = `false` em 69 |
| `obra_endereco_texto` | `site_address_text` | **100% vazia** |
| `location`, `area_terreno_m2`, `area_projeto_m2`, `loteamento_*` | `location`, `land_area_m2`, `project_area_m2`, `subdivision_*` | **100% vazias** |
| `notes` | `notes` | **100% vazia** |
| `terreno_tipo`, `finalidade_projeto` | `project_land_types`, `project_purposes` | `[]` nas 73 linhas — **nenhuma linha-filha** |
| `checklist_etapa` | `project_checklist_items` | `[]` nas 73 linhas — **nenhuma linha-filha** |

### 1.9 `Task` (130) → `tasks` + `task_checklist_items`

| base44 | nosso | Observação |
|---|---|---|
| `title`, `description` | idem | |
| `project_id` | `project_id` | **18 órfãos** (16 ids distintos), todos com `project_name` preenchido |
| `phase` | `phase` | **36 linhas** fora do de/para |
| `status` | `status` | **4 linhas** fora do de/para; 1 vazia → default |
| `priority` | `priority` | nenhuma `Urgente` — o check de `tasks` passa |
| `task_type` | `task_type` | 60 vazios |
| `responsible_id` | `responsible_id` | **15 órfãos** (6 ids distintos) |
| `start_date`, `due_date`, `completion_date` | idem | 1 linha viola `completion_date` x `status` |
| `estimated_hours` | `estimated_hours` | 5 preenchidos |
| `spent_hours` | `spent_hours` | **100% vazia** |
| `tag_operacional` | — | **campo que o base44 tem e nosso schema não previu** (seção 8.1) |
| `checklist_tarefa` (array JSON) | `task_checklist_items` | 1.704 itens em 108 tarefas |

Dentro de `checklist_tarefa`, as chaves são `ordem`, `titulo`, `etapa`,
`obrigatorio`, `concluido`. Mapeiam para `display_order`, `title`, `phase`,
`is_required`, `is_completed`. As 8 fases distintas estão todas no de/para.

**Não existe campo de data de conclusão no item do base44.** A
`task_checklist_items_required_completed_needs_date_check` exigia
`completed_at` quando o item era obrigatório e concluído. São **1.178 itens**
nessa situação (e coincidem exatamente com o total de itens concluídos: todo
item concluído no export é obrigatório).

**DECIDIDO: o item entra sem data.** A migration `0060` derrubou o check.
`completed_at` fica nulo e significa "concluído, e o quando não foi
registrado". Nenhuma data sentinela é inventada.

### 1.10 `Atividade` (156) → `activities`

| base44 | nosso | Observação |
|---|---|---|
| `descricao` | `description` | NOT NULL, 0 vazios |
| `colaborador_id` | `collaborator_id` | NOT NULL, 1 órfão |
| `prazo_inicio`, `prazo_termino` | `start_date`, `end_date` | NOT NULL, 0 vazios, nenhuma invertida |
| `coordenador_id` | `coordinator_id` | **100% vazia** |
| `projeto_id`, `cliente_id` | `project_id`, `client_id` | zero órfãos |
| `status`, `prioridade` | `status`, `priority` | 6 `Urgente` — só `activities` aceita |
| `ordem_execucao` | `execution_order` | **100% vazia** |
| `data_inicio_real`, `data_conclusao_real` | `started_at`, `completed_at` | **10 linhas** violam `completed_at` x `status` |
| `iniciado_por`, `concluido_por` | `started_by`, `completed_by` | 1 órfão cada |
| `observacoes` | `notes` | |
| `ultimo_alerta_em` | `last_alert_on` | 125 preenchidos |
| `data_exclusao`, `usuario_exclusao_id` | `deleted_at`, `deleted_by` | **1 linha** com um sem o outro |
| `atividade_excluida` | — | **descartada.** Bandeira redundante: bate 141/141 com `data_exclusao` |
| `tempo_total_minutos` | — | **descartada.** É coluna gerada no nosso schema. 11 linhas têm o valor gravado sem `data_inicio_real`, e nessas a coluna gerada dá `NULL`. Nas 109 que têm o par, o valor gravado bate com o calculado |

Detalhe de volume que muda a leitura: **141 das 156 atividades estão
excluídas.** O módulo tem 15 atividades vivas.

### 1.11 `FinancialCategory` (6) → `financial_categories`

`name` → `name`, `type` → `type`, `cost_center` → `cost_center`. Todos os
valores mapeados, unique `(type, name)` sem colisão. As 6 entram.

### 1.12 `AccountReceivable` (279) → `accounts_receivable`

| base44 | nosso | Observação |
|---|---|---|
| `description`, `value`, `due_date` | idem | `value` é `> 0` no nosso check: **4 linhas com zero** |
| `client_id`, `contract_id`, `project_id` | idem | zero órfãos; 10 sem contrato, 23 sem projeto |
| `installment_number` | `installment_number` + `installment_total` | **é texto `"n/total"`** no base44. 278 no formato, 1 vale só `"1"` (sem total, e o par é obrigatório) |
| `issue_date` | `issue_date` | |
| `status` | `status` | |
| `payment_date` | `payment_date` | **15 linhas** violam `payment_date` x `status` |
| `payment_method` | `payment_method` | nenhum `Débito automático` — o check passa |
| `contract_number` | — | **descartada**; 17 das 269 divergem do contrato apontado |
| `responsible_id`, `responsible_name`, `receipt_url` | — | **100% vazias**, e nosso schema não tem responsável em recebível |

A unique `(tenant_id, contract_id, installment_number)` **não colide**: 278
chaves para 278 linhas parseáveis.

### 1.13 `AccountPayable` (497) → `accounts_payable`

| base44 | nosso | Observação |
|---|---|---|
| `supplier` | `supplier_name` | NOT NULL, 0 vazios. É **texto**, não FK para `suppliers` — 86 nomes distintos, contra 37 fornecedores cadastrados |
| `description`, `category`, `value`, `due_date` | idem | 9 categorias, todas mapeadas |
| `project_id` | `project_id` | zero órfãos; 466 sem projeto |
| `status`, `payment_date`, `payment_method` | idem | 2 linhas violam `payment_date` x `status` |
| `competence_month` | `competence_month` | **é texto `MM/AAAA`**, nossa coluna é `date` com check de primeiro dia do mês. 316 preenchidos, 1 malformado (`012026`) |
| `is_recurring`, `recurrence_frequency`, `recurrence_start_date`, `recurrence_end_date`, `recurrence_count`, `recurrence_parent_id`, `recurrence_status` | idem | 35 mães, 307 ocorrências, 155 avulsas. Zero ocorrências apontam para mãe inexistente; zero filhos marcados como recorrentes |
| `generated_count` | — | **campo que o base44 tem e nosso schema não previu** (seção 8.2) |
| `responsible_*`, `receipt_url` | — | **100% vazias** |

Violações de check: 2 mães sem plano de recorrência, 3 com fim antes do
início. `recurrence_status` está preenchido em 151 linhas que não são
recorrentes nem ocorrência — o schema aceita, mas o valor não significa nada.

### 1.14 `Fornecedor` (37) → `suppliers` + `supplier_brands`

| base44 | nosso | Observação |
|---|---|---|
| `nome` | `name` | 30 distintos em 37 — **4 nomes repetidos, 11 linhas envolvidas**. Sem unique no schema; não trava, mas é cadastro duplicado |
| `tipologia` | `category` | **NOT NULL**, 1 vazia. E 1 fornecedor tem `Revestimento de Fachada`, um dos quatro valores que só valem em item de orçamento — o check `suppliers_category_domain_check` **barra a linha** |
| `contato_whatsapp` | `contact_whatsapp` | NOT NULL, 0 vazios; formato livre (3 grafias diferentes de DDD) |
| `contato_nome`, `contato_email` | `contact_name`, `contact_email` | e-mail em 4 de 37 |
| `cidade`, `estado` | `city`, `state` | Fortaleza/CE nas 37 |
| `tem_showroom`, `atende_fora_fortaleza` | `has_showroom`, `serves_outside_fortaleza` | |
| `modelo_parceria`, `nivel_parceria`, `status`, `prazo_pagamento_comissao` | idem | todos mapeados |
| `percentual_comissao`, `desconto_padrao` | `commission_percent`, `standard_discount_percent` | `5` em 37 e `0` em 17 — valor único, ninguém editou |
| `site` | `website` | **14 dos 15 valores começam com apóstrofo e são @ do Instagram**, não URL. Artefato de planilha |
| `marcas_representadas` (array) | `supplier_brands` | 67 marcas em 36 fornecedores; texto livre |
| `telefone`, `endereco`, `observacoes`, `prazo_entrega_medio`, `ultimo_pedido_data` | `phone`, `address`, `notes`, `average_delivery_time`, `last_order_date` | **100% vazias** |
| `total_comissao_recebida` | — | **100% vazia**; não portado (é derivado) |

### 1.15 `ChecklistOrcamento` (7) → `budget_checklists` + `budget_checklist_items`

| base44 | nosso | Observação |
|---|---|---|
| `client_id` | `client_id` | NOT NULL, zero órfãos |
| `project_id` | `project_id` | 1 vazio — nullable aqui de propósito |
| `responsavel_orcamento_id` | `responsible_id` | zero órfãos |
| `status_geral`, `fase_projeto` | `status`, `project_phase` | `Pós-aprovação` em 3, valor que só existe aqui |
| `data_inicio`, `data_conclusao` | `start_date`, `completion_date` | `data_conclusao` 100% vazia |
| `curadoria_percentual` | `curation_percent` | `5` nas 7 |
| `valor_total_estimado`, `valor_total_aprovado`, `valor_total_comissao`, `curadoria_valor_total` | — | **descartadas**: derivadas, vivem nas views da migration 0051 (`curadoria_valor_total` já foi removida na 0055) |
| `itens` (array JSON, 19 itens) | `budget_checklist_items` | ver abaixo |

Os itens trazem `nome_item`, `descricao`, `categoria`, `status_item`,
`prioridade`, `data_prazo`, `valor_estimado`, `valor_aprovado`,
`comissao_percentual`, `aprovado_cliente`, `data_aprovacao`, `obrigatorio`,
`observacoes`, `responsavel_item_id`, `fornecedor_escolhido_id`,
`fornecedores_cotados`. Todos os enums mapeados; zero fornecedores órfãos;
**zero cotações** (`budget_item_quotes` nasce vazia); zero arquivos anexados.
`comissao_valor` e `concluido` são descartados — o primeiro é coluna gerada,
o segundo é a bandeira que o `ENUM-MAP` já registra como não portada.

### 1.16 `PropriedadeMapa` (253) → `map_properties` + duas filhas

| base44 | nosso | Observação |
|---|---|---|
| `lat`, `lng` | `lat`, `lng` | NOT NULL, 253 preenchidos, nenhum fora de faixa, nenhum (0,0), nenhuma coordenada repetida |
| `project_id` / `project_label` | idem | mutuamente exclusivos no dado real: **zero linhas** com os dois. 52 vinculados, 201 rotulados |
| `client_id` / `client_label` | idem | idem: 74 vinculados, 179 rotulados, zero com os dois |
| `status_visual` | `visual_status` | **1 linha** com `Em andamento`, fora do de/para |
| `address`, `city`, `state` | idem | `address` tem quebra de linha dentro do valor (saída do Nominatim) |
| `area_terreno_m2`, `area_projeto_m2` | `land_area_m2`, `project_area_m2` | 243 e 242 preenchidos |
| `loteamento_nome/quadra/lote` | `subdivision_name/block/lot` | ~206 preenchidos |
| `terreno_tipo` (array) | `map_property_land_types` | 253 itens, 3 valores distintos |
| `finalidade_projeto` (array) | `map_property_purposes` | 183 itens em 179 linhas, 6 valores distintos |

4 projetos têm mais de um pino apontando para eles. O schema permite.

### 1.17 `ProjectTimelineEntry` (36) → **nenhuma tabela**

Ver seção 7.1.

---

## 2. Enums: o que NÃO está no de/para

Varredura de todas as colunas de enum de todos os CSV, incluindo os enums
dentro de JSON aninhado (`Negociacao.tipo_servico`,
`ChecklistOrcamento.itens[]`, `Task.checklist_tarefa[].etapa`,
`PropriedadeMapa.terreno_tipo`, `PropriedadeMapa.finalidade_projeto`).

**64 linhas** chegam com valor que o de/para não tem. Pela regra do projeto,
todas vão para o relatório de pendências. Nenhuma vira `other` no silêncio.

| Coluna | Valor que chegou | Linhas | Diagnóstico |
|---|---|---|---|
| `Task.phase` | `Estudo preliminar` | 18 | fase que a operação usa e o base44 nunca declarou |
| `Task.phase` | `Em Obra` | 14 | idem |
| `Task.phase` | `Anteprojeto` | 3 | idem |
| `Task.phase` | `Executivo` | 1 | provável abreviação de `Projeto Executivo` — **não deduzir** |
| `Project.project_type` | 8 grafias distintas de lista separada por vírgula | 18 | ver abaixo |
| `Task.status` | `A fazer` | 2 | sinônimo de `Não iniciado` — **não deduzir** |
| `Task.status` | `Em revisão` | 1 | não é status, é situação |
| `Task.status` | `Em espera cliente` | 1 | idem |
| `Client.client_type` | `Lead` | 1 | terceiro tipo de cliente que a entidade não declara |
| `Client.client_type` | `lead` | 1 | o mesmo, em caixa diferente |
| `Client.lead_source` | `WhatsApp` | 1 | canal que a lista fechada não tem |
| `Negociacao.tipo_servico` | `Complementares` | 1 | provável `Projetos Complementares` |
| `Negociacao.tipo_servico` | `Projeto de Arquitetura` | 1 | rótulo de `Contract`, não de serviço |
| `PropriedadeMapa.status_visual` | `Em andamento` | 1 | `map_visual_status` tem `Em desenvolvimento`, não `Em andamento`. São enums propositalmente diferentes (`ENUM-MAP`, seção Mapa) |

**O caso `Project.project_type` merece parágrafo próprio.** `Project.jsonc`
declara quatro valores (`Arquitetura`, `Arquitetura + Complementares`,
`Arquitetura + Interiores`, `Todos`). 55 das 73 linhas obedecem. As outras 18
trazem a **lista de serviços da negociação**, concatenada com vírgula e em
ordem instável:

```
Arquitetura, Estrutura, Hidrosanitário, Elétrico            7
Arquitetura, Interiores                                     4
Arquitetura, Interiores, Estrutura, Hidrosanitário, Elétrico  2
Arquitetura, Interiores, Estrutura, Elétrico, Hidrosanitário  1
Elétrico, Hidrosanitário, Estrutura, Arquitetura, Interiores  1
Elétrico, Hidrosanitário, Estrutura, Interiores, Arquitetura  1
Arquitetura, Estrutura                                      1
Arquitetura, Interiores, Estrutura, Hidrosanitário          1
```

Três dessas grafias descrevem o mesmo conjunto de cinco serviços em ordens
diferentes — é `Negociacao.tipo_servico` serializado, não um tipo de
contrato. `project_type` é **NOT NULL**: 18 projetos não entram até alguém
decidir. Traduzir `Arquitetura, Interiores` para `architecture_interiors`
seria adivinhação, e `Arquitetura, Estrutura, Hidrosanitário, Elétrico` não
tem equivalente nos quatro valores de jeito nenhum.

**Nada disso é falha de `docs/ENUM-MAP.md`.** Todos os 14 valores acima também
violam a declaração `enum` da entidade correspondente em
`projeto-original/base44/entities/`. O base44 aceita escrita fora do enum
declarado. O de/para reflete o que o original **declara**; o dado reflete o
que a operação **digitou**.

---

## 3. Órfãos

Linha que aponta para um `legacy_id` que não existe no export. Regra: não
descarta em silêncio, não aponta para nulo, vai para o relatório de
pendências.

| Origem | Alvo | Órfãos | Ids distintos | Peso |
|---|---|---|---|---|
| `PermissoesUsuario.colaborador_id` | `Collaborator` | **94** | 7 | ver seção 6 |
| `SolicitacaoAcesso.aprovado_por_id` | `Collaborator` | **22** | 2 | 22 de 22 linhas |
| `ClientIntake.negociacao_id` | `Negociacao` | 21 | 21 | nullable |
| `ClientIntake.cliente_crm_id` | `Client` | 18 | 11 | **NOT NULL** |
| `Task.project_id` | `Project` | 18 | 16 | nullable |
| `Task.responsible_id` | `Collaborator` | 15 | 6 | nullable |
| `Negociacao.responsavel_comercial_id` | `Collaborator` | **15** | 1 | **NOT NULL** |
| `Negociacao.contrato_vinculado_id` | `Contract` | 10 | 10 | nullable |
| `Negociacao.projeto_vinculado_id` | `Project` | 4 | 4 | coluna descartada |
| `Project.client_id` | `Client` | 3 | 3 | nullable |
| `Project.responsible_id` | `Collaborator` | 2 | 2 | nullable |
| `Negociacao.cliente_id` | `Client` | 2 | 2 | nullable |
| `Atividade.colaborador_id` | `Collaborator` | 1 | 1 | **NOT NULL** |
| `Atividade.iniciado_por` | `Collaborator` | 1 | 1 | nullable |
| `Atividade.concluido_por` | `Collaborator` | 1 | 1 | nullable |

Zero órfãos em: `Contract.client_id`, `Contract.project_id`,
`Project.contract_id`, `AccountReceivable.{client_id,contract_id,project_id}`,
`AccountPayable.{project_id,recurrence_parent_id}`, `Atividade.{projeto_id,cliente_id}`,
`ChecklistOrcamento.*`, `PropriedadeMapa.{project_id,client_id}`,
`ProjectTimelineEntry.project_id`, `Collaborator.coordenador_id` (vazio).

Três casos merecem nota separada:

**`SolicitacaoAcesso.aprovado_por_id` — 22 de 22.** Os dois ids que aparecem
não são `Collaborator.id`: são ids de **usuário da plataforma base44**. No
base44 as duas coisas coexistem e não têm ligação declarada. Nosso
`access_requests.decided_by` é FK composta para `collaborators`. A boa
notícia é que o check `access_requests_pending_has_no_decision_check` só
proíbe decisão em pedido *pendente*: as 22 são `Aprovada`, então `decided_by`
nulo passa. Mas nulificar em silêncio é exatamente o que a regra proíbe —
as 22 vão para o relatório com o par (id da plataforma, nome do aprovador).

**`Negociacao.responsavel_comercial_id` — 15 linhas, 1 id.** É uma pessoa só,
que aparece com nome em `responsavel_comercial_name` mas não está no export
de `Collaborator`. Como `commercial_owner_id` é NOT NULL, ou o escritório
recadastra essa pessoa como colaborador, ou as 15 negociações ficam de fora.

**`ClientIntake.cliente_crm_id` — 18 linhas, 11 clientes.** Formulários
gerados para clientes que depois saíram do CRM. Como as 42 linhas são links
nunca abertos e já expirados, o valor de recuperá-las é próximo de zero — mas
a decisão é do usuário, não do script.

---

## 4. Duplicatas e conflitos de unicidade

| Unicidade nossa | Chaves | Duplicadas | Linhas | Linhas que a unique derruba |
|---|---|---|---|---|
| `clients` unique `(tenant_id, tax_id_digits)` | 72 | 3 | 6 | **3** |
| `clients` unique `(tenant_id, client_key)` | 77 | 3 | 6 | **3** |
| `collaborators` unique `(tenant_id, email)` | 15 | 0 | 0 | 0 |
| `contracts` unique `(tenant_id, contract_number)` | 69 | 0 | 0 | 0 |
| `financial_categories` unique `(tenant_id, type, name)` | 6 | 0 | 0 | 0 |
| `accounts_receivable` unique `(tenant_id, contract_id, installment_number)` | 278 | 0 | 0 | 0 |

São os **mesmos 3 pares** nos três recortes de `clients`: as três duplicatas
de CPF/CNPJ são também duplicatas de e-mail e de nome exato. Ou seja: são
três clientes cadastrados duas vezes, não três colisões diferentes.

Sem unicidade no schema, mas com significado de negócio:

- **`SolicitacaoAcesso.email`**: 20 chaves para 22 linhas, 2 e-mails com
  pedido repetido. `access_requests` não tem unique por e-mail — entram as 22.
- **`Fornecedor.nome`**: 30 chaves para 37 linhas, **4 nomes repetidos em 11
  linhas**. Fornecedor cadastrado até 3 vezes. Não trava a importação.
- **`Client.cpf_cnpj` com formato inválido**: 1 linha com 10 dígitos.
- **`Client` sem documento e sem e-mail**: **42 de 122**. Nesses, `client_key`
  é nulo, a unique não os alcança, e a deduplicação do módulo 2 não tem por
  onde pegar. É o buraco estrutural da base de clientes.

---

## 5. Ordem de importação

Segue a ordem dos módulos. Uma tabela só entra depois das que ela referencia.

```
 1. tenants                    criado a mão (não vem do export)
 2. tenant_email_domains       ver seção 7.3 — precisa existir ANTES do primeiro login
 3. menus                      já populada pela migration 0004
 4. collaborators              <- Collaborator
 5. collaborator_permissions   <- PermissoesUsuario         dep: 4, 3
 6. access_requests            <- SolicitacaoAcesso         dep: 4 (decided_by)
 7. clients                    <- Client
 8. negotiations               <- Negociacao                dep: 7, 4
 9. negotiation_services       <- Negociacao.tipo_servico   dep: 8
10. negotiation_owner_history  <- Negociacao.historico_...  dep: 8, 4
11. contracts                  <- Contract                  dep: 7, 8
12. client_intakes             <- ClientIntake              dep: 7, 8
13. projects                   <- Project                   dep: 7, 11, 4
14. project_land_types         <- Project.terreno_tipo      dep: 13   (vazia)
15. project_purposes           <- Project.finalidade_...    dep: 13   (vazia)
16. project_checklist_items    <- Project.checklist_etapa   dep: 13   (vazia)
17. tasks                      <- Task                      dep: 13, 4
18. task_checklist_items       <- Task.checklist_tarefa     dep: 17
19. activities                 <- Atividade                 dep: 4, 13, 7
20. financial_categories       <- FinancialCategory
21. accounts_receivable        <- AccountReceivable         dep: 7, 11, 13
22. accounts_payable           <- AccountPayable            dep: 13 + ela mesma
23. suppliers                  <- Fornecedor
24. supplier_brands            <- Fornecedor.marcas_...     dep: 23
25. budget_checklists          <- ChecklistOrcamento        dep: 7, 13, 4
26. budget_checklist_items     <- ChecklistOrcamento.itens  dep: 25, 23
27. budget_item_quotes         <- itens[].cotacoes          dep: 26, 23  (vazia)
28. map_properties             <- PropriedadeMapa           dep: 13, 7
29. map_property_land_types    <- PropriedadeMapa.terreno   dep: 28
30. map_property_purposes      <- PropriedadeMapa.final...  dep: 28
```

Dois pontos de ordem interna:

- **Passo 11 depende do 8** por causa de `contracts.negotiation_id`, que é
  preenchido a partir de `Negociacao.contrato_vinculado_id` — o lado oposto
  do que o CSV de `Contract` traz.
- **Passo 22 depende de si mesmo**: as 35 linhas-mãe de recorrência precisam
  entrar antes das 307 ocorrências que apontam para elas. Duas passadas sobre
  o mesmo arquivo, ou uma passada ordenada por `is_recurring desc`.

---

## 6. O caso das permissões

357 linhas para **22 colaborador_id distintos** e 25 nomes distintos — não
para 15 pessoas. O export de `Collaborator` tem 15.

**94 linhas (26%) pertencem a 7 pessoas que não estão no export de
`Collaborator`:**

| Perfil (anonimizado) | Linhas | Natureza aparente |
|---|---|---|
| A | 25 | nome de pessoa real, grafia diferente de um colaborador que existe |
| B | 15 | pessoa real, sem cadastro de colaborador |
| C | 15 | pessoa real, sem cadastro de colaborador |
| D | 14 | conta de teste (nome literalmente `Test`) |
| E | 13 | nome de pessoa real em caixa baixa, sem sobrenome |
| F | 7 | conta de teste (nome literalmente `TESTE 01`) |
| G | 5 | pessoa real, sem cadastro de colaborador |

Dois são conta de teste declarada. Dois outros **parecem** ser grafia
alternativa de alguém que já existe no export — o par (A, colaborador
existente) difere só por um sufixo, e o par (E, G) é a mesma pessoa com e
sem sobrenome. Mas "parecem" não é critério: a FK composta de
`collaborator_permissions` referencia `collaborators (id, tenant_id)`, e sem
colaborador não há onde pendurar a linha. As 94 vão para pendências, com o
nome, para o escritório decidir uma a uma. (Os nomes reais saem do script,
não deste documento — `db/` tem dado pessoal e o repositório não.)

Os 15 colaboradores do export **todos** têm pelo menos uma linha de permissão.

**Conflitos de menu duplicado: 44 casos, em 17 colaboradores.**

São os casos em que as duas grafias do mesmo menu existem para a mesma pessoa
com valores diferentes de `pode_visualizar`/`pode_editar`. Distribuição por
menu:

| `menu_key` | Conflitos | Grafias envolvidas |
|---|---|---|
| `project_flow` | 13 | `Fluxo do Projeto` / `Tarefas` |
| `crm` | 6 | `CRM` / `Clientes` |
| `pipeline` | 4 | `Pipeline` / `Negociações` |
| `contracts` | 4 | `Contratos & Propostas` / `Contratos` |
| `team` | 3 | `Equipe` / `Colaboradores` |
| `receivables` | 3 | `Recebíveis` / `Contas a Receber` |
| `payables` | 3 | `Pagamentos` / `Contas a Pagar` |
| `dashboard_commercial` | 3 | `Painel Comercial` / `Dashboard Comercial` |
| `access_control` | 2 | `Controle de Acesso` / `Aprovações de Acesso` |
| `dashboard_overview` | 2 | `Visão Geral` / `Dashboard Geral` |
| `dashboard_executive` | 1 | `Painel Executivo` / `Dashboard Executivo` |

**REGRA EM VIGOR: vence o mais restritivo.** Decisão do usuário, tomada na
etapa de importação e aplicada por `scripts/import-base44.mjs`. Em conflito,
`can_view` e `can_edit` só ficam verdadeiros se **todas** as grafias daquele
menu disserem verdadeiro. A regra antiga ("o mais permissivo", que estava no
`SCHEMA-PLAN` e no `ENUM-MAP`) está superada, e os dois documentos foram
corrigidos para não deixarem duas regras escritas.

Padrão dominante e o que ele significa: em 13 dos 44, uma pessoa tem
`Fluxo do Projeto` com `view=true edit=true` e `Tarefas` com
`view=false edit=false`. Aplicar "o mais permissivo" **daria acesso de edição
ao Fluxo do Projeto para 13 pessoas** — inclusive perfis de Arquiteto e
Estagiário. Não é uma escolha óbvia. Existe
o caso simétrico: três colaboradores (um deles uma conta de teste) têm o
padrão **invertido** em `crm`, `contracts`, `pipeline`, `team`, `payables` e
`receivables` — lá a grafia nova é a permissiva e a antiga é a negada. Isso
mostra que as duas grafias foram gravadas em momentos diferentes por telas
diferentes, e que nenhuma delas é "a certa" por construção.

`pares colapsados sem conflito`: 15. Nesses, as duas grafias trazem o mesmo
valor e a consolidação é mecânica.

**Volume final:** 298 linhas de `collaborator_permissions` depois de
consolidar, ou **210** contando só os 15 colaboradores que existem no export.
Os agrupadores `financial` e `team_group` não recebem linha nenhuma —
exatamente como o `ENUM-MAP` prevê.

---

## 7. Os três pontos que precisavam de confirmação

### 7.1 `ProjectTimelineEntry` — confirmado: dado sem destino

Confirmado por três buscas independentes em `projeto-original/`:

- `grep -ril "TimelineEntry" projeto-original/` → **zero arquivos**.
- `projeto-original/base44/entities/` tem **16 arquivos**, e nenhum é
  `ProjectTimelineEntry.jsonc`.
- Nenhuma tela, componente ou hook menciona a entidade.

É dado que o base44 gerou (provavelmente por automação da plataforma) e que a
aplicação original nunca leu. **Não se inventa tabela para ele.**

O que existe nas 36 linhas, e portanto o que se perde:

| Campo | Conteúdo |
|---|---|
| linhas | 36, sobre 18 projetos |
| `is_automatico` | 31 automáticas, 5 manuais |
| `entry_type` | `Sistema` 31, `Alteração de Projeto` 3, `Decisão` 1, `Reunião` 1 |
| `status_registro` | `Concluído` 31, `Em andamento` 5 |
| `evento_chave` | 31 preenchidos, prefixos `responsavel:`, `fase:`, `tag-on:`, `tag-off:`, `relatorio:` |
| `titulo`/`descricao` | 17 títulos distintos, do tipo "Responsável alterado: X → Y" e "Projeto movido de Perspectivas → Layout" |
| `anexos` | 5 arquivos, **todos hospedados em `base44.app`** |

O que se perde, em uma frase: **o histórico de quem mudou o responsável e a
fase de 18 projetos, entre fevereiro e agosto de 2026, mais 5 anexos que
ficam no base44.** As 31 automáticas são reconstituíveis em parte — a fase
atual e o responsável atual estão em `Project`; o que some é o caminho até
eles. As 5 manuais (1 `Decisão`, 1 `Reunião`, 3 `Alteração de Projeto`) são
texto que ninguém mais escreve e que não existe em nenhum outro lugar.

Se o escritório quiser preservar isso, é feature nova (um diário de bordo por
projeto), não etapa de importação. A decisão fica com o usuário.

### 7.2 `Collaborator.senha_temporaria` — confirmado: existe e não é importada

A coluna **está** no cabeçalho de `Collaborator_export.csv`.
Está **100% vazia** nas 15 linhas — o campo existe no schema da entidade e
nenhuma linha o preencheu no momento do export.

Não é importada, por decisão registrada em `docs/ARCHITECTURE.md` ("Fora de
escopo"): o original guarda senha em texto puro. O onboarding passa a ser
convite por e-mail do Supabase Auth.

Estar vazia não muda a decisão. Se um export futuro vier com o campo
preenchido, o script continua ignorando a coluna — e isso precisa estar no
script, não só nesta doc.

### 7.3 Os 7 domínios de e-mail, `tenant_email_domains` e o primeiro acesso

Os 15 colaboradores usam **7 domínios**:

| Domínio | Pessoas | Natureza |
|---|---|---|
| `gmail.com` | 8 | pessoal |
| `creativearq.com.br` | 2 | corporativo — mas de **outro** escritório |
| `outlook.com` | 1 | pessoal |
| `hotmail.com` | 1 | pessoal |
| `shaus.com.br` | 1 | corporativo de terceiro |
| `edu.unifor.br` | 1 | institucional (universidade) |
| `fernandocosta.com` | 1 | o único que parece do escritório |

**11 dos 15 usam e-mail pessoal.** O domínio que dá nome ao tenant aparece em
uma única pessoa.

Consequências, e são três:

**(a) `tenant_email_domains` não funciona como filtro aqui.** O desenho da
migration 0002 usa o domínio para descobrir o tenant no cadastro, e a unique
é sobre `domain` **global**, não `(tenant_id, domain)`. Cadastrar `gmail.com`
como domínio do escritório Fernando Costa significa que **qualquer pessoa com
Gmail no mundo** é roteada para este tenant — e que nenhum outro tenant
poderá reivindicar `gmail.com` depois. O mesmo vale para `outlook.com` e
`hotmail.com`. Não é uma configuração aceitável.

**(b) `creativearq.com.br` é de outro escritório.** Cadastrá-lo dá entrada no
tenant Fernando Costa a quem tiver e-mail da Creative Arq. Também não é
aceitável, e é diferente do problema (a): aqui o domínio pertence
identificavelmente a terceiros.

**(c) O checklist de pré-importação de `docs/ARCHITECTURE.md` diz "cadastrar
o domínio de e-mail real em `tenant_email_domains` antes de qualquer pessoa
tentar entrar, senão o Supabase recusa o cadastro e o erro não explica o
motivo".** Com esta base de e-mails, **não existe "o domínio real"**.

Caminhos possíveis, todos exigindo decisão do usuário:

1. **Migrar os colaboradores para e-mail corporativo** antes da importação, e
   cadastrar só `fernandocosta.com`. É a única saída que deixa
   `tenant_email_domains` fazer o que foi desenhado para fazer.
2. **Não usar descoberta por domínio para este tenant**: convidar as 15
   pessoas por `auth.admin.inviteUserByEmail` e criar `tenant_users`
   diretamente, sem passar pelo cadastro aberto. Nesse caso
   `tenant_email_domains` fica com a única entrada `fernandocosta.com` e o
   fluxo de auto-cadastro não é usado por ninguém.
3. Cadastrar os 7 domínios. **Não recomendado** pelos motivos (a) e (b).

O caminho 2 é o que menos mexe no schema e o único que não entrega domínio
público a um tenant. Mas ele muda o fluxo de primeiro acesso descrito em
`ARCHITECTURE.md`, e por isso não é decisão do script de importação.

Ligado a isso: `Collaborator.user_auth_email` está **100% vazio**, então não
há nem sequer um segundo e-mail para conferir contra o `email` principal. O
vínculo colaborador ↔ login é 100% manual (pendência 3 do `SCHEMA-PLAN`).

---

## 8. O que o dado revela e o schema não previu

Coisas que só aparecem no volume real e que os 16 registros de exemplo do
`projeto-original` não mostravam.

### 8.1 `Task.tag_operacional` — campo que existe no dado e em lugar nenhum mais

13 tarefas têm `tag_operacional` preenchida, com dois valores:
`Aguardando Cliente` e `Em Revisão`. O campo **não está declarado em
`Task.jsonc`** e **não aparece em nenhum arquivo de `projeto-original/`**.
É um campo que alguém criou direto no base44 e que a aplicação nunca leu.

O que ele revela: os dois valores são exatamente os dois estados que faltam
em `Task.status` (`Em revisão`, `Em espera cliente` aparecem lá como valores
fora do enum). A operação precisa de uma noção de "tarefa parada esperando
alguém" que nem `status` nem `phase` expressam, e resolveu isso duas vezes,
de dois jeitos, sem que nenhum dos dois esteja no schema. Nosso `tasks` não
tem coluna para isso. **Decisão do usuário**: descartar as 13 tags, ou criar
a coluna.

### 8.2 `AccountPayable.generated_count` — contador de recorrência sem coluna nossa

493 das 497 linhas têm `generated_count`; 26 mães têm valor maior que zero.
É quantas ocorrências a mãe já gerou. Nosso `accounts_payable` não tem essa
coluna: a contagem é derivável (`count(*) where recurrence_parent_id = mae`).
Descartar é seguro, mas vale conferir na primeira execução se os dois números
batem — se não baterem, o base44 gerou ou apagou ocorrência fora do fluxo.

### 8.3 O escritório tem projeto fora do Brasil e fora do Ceará

`PropriedadeMapa.state` vem por extenso (o `Client.current_state` vem por
sigla — duas convenções, mesma informação) e tem **21 valores distintos**,
entre eles:

`Andaluzia`, `Flórida`, `Sánchez Ramírez` (República Dominicana), `دبي`
(Dubai), `Luanda`, e os agregados `Região Nordeste` e `Sudoeste`.

Do lado de `Client.country`, dois clientes têm `Angola` e `Suriname`.

Duas leituras. A primeira: o escritório atende fora do Brasil, e nenhuma tela
foi pensada para isso (o formulário de cliente tem UF, não região
administrativa estrangeira). A segunda, mais provável para os valores
agregados: `Região Nordeste` e `Sudoeste` são **saída de reverse geocoding do
Nominatim**, não escolha de ninguém — o pino caiu no mar ou em área sem
município e a OSM devolveu a divisão administrativa que tinha. Isso reforça o
ponto do Nominatim já listado como pendência de segurança: o `state` do mapa
não é dado que o escritório digitou, é dado que a OpenStreetMap devolveu.

### 8.4 141 das 156 atividades estão excluídas

A tabela `activities` tem exclusão lógica e o módulo 6 foi desenhado em cima
disso. O que o volume real mostra é que **a exclusão é o estado normal**: 90%
das atividades estão apagadas, restam 15 vivas. A tela de atividades, com
dado real, mostra 15 linhas — e qualquer relatório que não filtre
`deleted_at is null` mostra dez vezes mais.

Nenhuma atividade tem `execution_order` — a coluna está 100% vazia no export
—, então o `activities_deleted_has_no_execution_order_check` não é acionado
por nenhuma das 141. A fila de execução por pessoa nasce vazia e é construída
no uso.

### 8.5 `AccountPayable.supplier` é texto, e não bate com `suppliers`

86 nomes distintos de fornecedor nas contas a pagar, contra 37 fornecedores
cadastrados. É assim no original (`supplier_name text not null`, sem FK), e
o nosso schema copiou isso de propósito. Mas com volume real fica visível que
o cadastro de fornecedores cobre menos da metade de quem o escritório paga —
ou seja, o módulo 8 e o módulo 7 falam de universos diferentes.

### 8.6 Financeiro: o dinheiro está quase todo em recorrência e em duas categorias

Das 497 contas a pagar, 342 (69%) fazem parte de alguma recorrência (35 mães
+ 307 ocorrências). Das 10 categorias de despesa, duas concentram 327
lançamentos (`Impostos` 164, `Folha` 163). `Viagens` e `Equipamentos` têm 1
lançamento cada.

Do lado do recebimento, `Boleto` responde por 196 dos 206 pagamentos com meio
informado.

### 8.7 A negociação e o contrato usam numerações que não conversam

`Negociacao.contrato_vinculado_number` tem 76 valores no formato
`CTR-<timestamp>`; `Contract.contract_number` tem 69 no formato sequencial de
4 dígitos (`0716`, `0722`…). **Zero** batem. A ligação real é por id, e essa
funciona (66 de 76). O campo de número é lixo herdado de uma numeração
anterior. Já estava marcado para descarte; o dado confirma que descartar é
correto e que nenhuma tela pode depender dele.

Relacionado: `AccountReceivable.contract_number` diverge do contrato apontado
em **17 das 269 linhas**. É snapshot desatualizado, não erro de ligação — mais
uma razão para o campo não existir do nosso lado.

### 8.8 Quatro tabelas-filhas nascem vazias

`project_land_types`, `project_purposes`, `project_checklist_items` e
`budget_item_quotes` não recebem uma linha sequer: os campos de origem são
`[]` em 100% das linhas. `Project.terreno_tipo` e `Project.finalidade_projeto`
têm dado no **mapa** (253 e 183 itens), mas não em `Project`. O escritório
usa esses dois campos só pelo mapa.

### 8.9 Prazos de fase: 33% dos contratos não têm todos

`prazo_projetos_complementares` está preenchido em 23 dos 69 contratos;
`prazo_perspectivas` em 63. Dois contratos têm prazo **zero**, que nosso
check `> 0` recusa. Zero num campo de prazo é "não se aplica", e a coluna
nullable já expressa isso — mas alguém digitou 0 em vez de deixar vazio.

---

## 9. Decisões que o usuário precisa tomar antes de o script ser escrito

> **Estado depois da 2ª passada da importação.** A régua da 1ª passada
> ("linha órfã nunca aponta para nulo") recusou 398 linhas das 1.756 das onze
> entidades principais, e a maior parte delas caiu por cascata, não por
> defeito. A 2ª passada trocou a régua por: *ponteiro órfão em coluna que
> aceita nulo entra como nulo* (a ausência é a verdade), *cascata continua
> derrubando* (o vínculo é real e volta na re-execução) e *tradução de formato
> é feita e registrada*. Sobraram **94 linhas**, todas com motivo escrito.
>
> Resolvidos por essa passada: itens 1 (parcialmente — `Em Obra` não), 2, 8,
> 10 (parcialmente — `Revestimento de Fachada` não). Detalhe do critério de cada
> tradução em `docs/ENUM-MAP.md`.
>
> **Estado depois das migrations 0061–0066** (2026-08-06). A restrição passou a
> distinguir dado importado de dado nascido aqui, pelo `legacy_id` — ver
> `docs/ARCHITECTURE.md`, seção "A restrição distingue dado importado de dado
> nascido aqui". No banco, **as 94 linhas de entidade principal que sobraram
> deixaram de ser recusadas**, e com elas as 351 linhas-filhas que caíam por
> cascata (290 itens de checklist, 49 serviços de negociação, 10 cotações, 2
> marcas): 445 das 539 linhas do relatório de pendências.
>
> Continua aberto **um** caso, e ele não é de restrição: as **94
> `collaborator_permissions` de 7 pessoas sem cadastro de colaborador**. A FK não
> tem onde pendurar, e criar a pessoa exigiria inventar e-mail (NOT NULL, único
> por escritório) e função (NOT NULL, e é ela que define o que a pessoa pode
> fazer). Duas das sete são conta de teste declarada no próprio dado. É decisão
> do escritório, uma a uma, com o relatório na mão: recadastrada a pessoa, a
> reimportação religa as linhas dela sozinha pelo `legacy_id`.
>
> **As migrations são necessárias e não são suficientes.** Os guardas do
> `scripts/import-base44.mjs` espelhavam os checks antigos e continuavam
> recusando as mesmas linhas.
>
> **Estado depois da 3ª passada** (2026-08-06). Os guardas foram afrouxados junto
> com o banco, cada um virando `g.note(...)` — a linha entra e a exceção usada
> sai na seção AJUSTES do relatório, linha a linha, em vez de virar silêncio. O
> passo 27 (`budget_item_quotes`) mudou mais que os outros: as cotações ganharam
> `legacy_id` no formato que a `0066` documenta
> (`<item_id>:<fornecedor_id>:<posição no array>`) e o `onConflict` passou de
> `item_id,supplier_id` para `tenant_id,legacy_id`, porque o índice virou parcial
> e índice parcial não serve de alvo de `ON CONFLICT` (42P10).
>
> **Resultado: as 445 linhas entraram.** Restam as 94 `collaborator_permissions`
> de 7 pessoas — o único caso, e ele não é de restrição. As três tabelas de
> dinheiro batem 100% do CSV: contratos R$ 3.707.252,00, recebíveis
> R$ 2.625.509,77, pagáveis R$ 2.572.690,45.

Em ordem de quanto travam:

1. **Os 4 valores de `Task.phase` fora do enum** (36 tarefas): `Estudo
   preliminar`, `Em Obra`, `Anteprojeto`, `Executivo`. Viram fase nova no
   enum, viram uma das 12 existentes, ou as 36 tarefas ficam de fora?
2. **`Project.project_type` com lista de serviços** (18 projetos, NOT NULL).
   Qual dos 4 valores cada uma dessas 18 recebe?
3. ~~**`task_checklist_items`**: 1.178 itens obrigatórios e concluídos sem
   data.~~ **DECIDIDO: entram sem data.** O check foi derrubado pela migration
   `0060`; `completed_at` nulo significa "concluído, e o quando não foi
   registrado".
4. **As 7 pessoas com permissão e sem cadastro de colaborador** (94 linhas).
   Quais são contas de teste para descartar e quais são pessoas reais para
   recadastrar?
5. ~~**Os 44 conflitos de permissão duplicada.**~~ **DECIDIDO: vence o mais
   restritivo.** Aplicado por `scripts/import-base44.mjs`; os 38 conflitos
   que envolvem colaborador com cadastro (os outros 6 são de pessoas fora do
   export) saem listados um a um em `scripts/import-pendencias.local` para
   conferência humana.
6. **`tenant_email_domains`** — os três caminhos da seção 7.3.
7. **`Negociacao.responsavel_comercial_id`**: 1 pessoa, 15 negociações, campo
   NOT NULL. Recadastrar a pessoa como colaborador?
8. **22 `access_requests` com aprovador que não é colaborador.** Gravar com
   `decided_by` nulo (o check permite) e registrar o nome no relatório?
9. **3 clientes duplicados** (mesmo CPF, mesmo e-mail, mesmo nome). Qual das
   duas linhas de cada par fica?
10. **Os valores soltos**: `Client.client_type` `Lead`/`lead` (2),
    `Client.lead_source` `WhatsApp` (1), `Task.status` `A fazer`/`Em
    revisão`/`Em espera cliente` (4), `Negociacao.tipo_servico`
    `Complementares`/`Projeto de Arquitetura` (2),
    `PropriedadeMapa.status_visual` `Em andamento` (1),
    `Fornecedor.tipologia` vazia (1) e `Fornecedor.tipologia` =
    `Revestimento de Fachada` (1), que o check de `suppliers` barra.
11. **`Task.tag_operacional`** (13 linhas): descartar ou criar coluna?
12. **`ProjectTimelineEntry`** (36 linhas): aceitar a perda ou virar feature?
13. **Incoerências de data x status**: 15 recebíveis, 10 atividades, 2
    pagáveis, 1 tarefa. O status está certo e a data errada, ou o contrário?
14. **4 recebíveis com valor zero.** Excluir ou corrigir?
15. **6 contratos com plano de parcelamento incompleto** e 2 com prazo zero.

---

## 10. O que este levantamento NÃO cobriu

Registrado para não passar por completo:

- **Não foi feita nenhuma escrita.** Nenhum `insert`, nenhuma conexão com o
  Postgres. Os números vêm só da leitura dos CSV.
- **Não foi conferido contra o banco de produção**, que ainda não existe
  separado do de desenvolvimento (pendência de `ARCHITECTURE.md`).
- **Encoding**: o parser trata BOM, aspas duplas escapadas, vírgula e quebra
  de linha dentro do valor. Não foi feita conferência de normalização Unicode
  (NFC vs NFD) nos nomes com acento — pode gerar falso negativo em comparação
  de nome, embora as comparações que importam sejam todas por id.
- **Anexos e arquivos**: nenhum arquivo do base44 foi baixado. `receipt_url`
  e `Contract.file_url` estão 100% vazios; os 5 anexos de
  `ProjectTimelineEntry` e os arquivos de item de orçamento (zero neste
  export) apontam para `base44.app` e não sobrevivem ao desligamento da
  plataforma.
