# De/para dos valores de lista (base44 → Postgres)

> Fonte da verdade da importação. O valor da esquerda é exatamente o que
> está gravado no base44 hoje; o do meio é o valor do enum no Postgres; o da
> direita é o rótulo exibido na UI em português.
>
> Regra: **nada é traduzido no ato da importação por adivinhação**. Valor que
> chegar do base44 e não estiver nesta tabela derruba a importação daquela
> linha e vai para um relatório de pendências — nunca vira `other` no
> silêncio.

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
valores diferentes de `can_view`/`can_edit`, **prevalece o mais permissivo**,
e a linha vai para o relatório de conflitos para conferência humana. Não há
como saber qual das duas o escritório considera correta.

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

### `client_type`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Pessoa Física | `individual` | Pessoa Física |
| Pessoa Jurídica | `company` | Pessoa Jurídica |

---

## Pipeline

### `service_type`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Arquitetura | `architecture` | Arquitetura |
| Interiores | `interiors` | Interiores |
| Estrutura | `structural` | Estrutura |
| Hidrosanitário | `plumbing` | Hidrosanitário |
| Elétrico | `electrical` | Elétrico |
| Consultoria | `consulting` | Consultoria |

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
| Aguardando Cliente | `awaiting_client` | Aguardando Cliente |
| Finalizado | `finished` | Finalizado |

`Finalizado` só existe em `Project.fase_projeto_atual`; `Task.phase` não tem
esse valor. O enum é único e `tasks` simplesmente nunca recebe `finished` —
garantido por check na tabela.

### `geocode_status`

| base44 | Postgres |
|---|---|
| PENDING | `pending` |
| OK | `ok` |
| FAILED | `failed` |

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

Diferença de gênero no rótulo ("Não iniciado" vs "Não iniciada") some no
enum e a UI passa a usar uma forma só.

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

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Cerâmica e Porcelanato | `ceramics_porcelain` | Cerâmica e Porcelanato |
| Metais e Louças | `fixtures_sanitaryware` | Metais e Louças |
| Pedras Naturais | `natural_stone` | Pedras Naturais |
| Iluminação Interna | `indoor_lighting` | Iluminação Interna |
| Iluminação Externa e Paisagismo | `outdoor_lighting` | Iluminação Externa e Paisagismo |
| Esquadrias | `frames_openings` | Esquadrias |
| Automação Residencial | `home_automation` | Automação Residencial |
| Energia Solar | `solar_energy` | Energia Solar |
| Tintas e Texturas | `paint_texture` | Tintas e Texturas |
| Paisagismo | `landscaping` | Paisagismo |
| Marcenaria | `cabinetry` | Marcenaria |
| Madeira | `wood` | Madeira |
| Estrutura e Fundação | `structure_foundation` | Estrutura e Fundação |
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

### `ChecklistOrcamento.fase_projeto`

Subconjunto de `project_phase`. Não gera enum próprio.

| base44 | Postgres |
|---|---|
| Perspectivas | `renderings` |
| Projeto Executivo | `construction_docs` |
| Projetos Complementares | `engineering_docs` |
| Pós-aprovação | `post_approval` |

`Pós-aprovação` não existe em `project_phase` — é adicionado ao enum
compartilhado e nunca usado por `projects` nem por `tasks`.

---

## Mapa

### `map_visual_status`

| base44 | Postgres | Rótulo UI |
|---|---|---|
| Não iniciado | `not_started` | Não iniciado |
| Em desenvolvimento | `in_development` | Em desenvolvimento |
| Pausado | `paused` | Pausado |
| Concluído | `completed` | Concluído |

Repare que não é igual a `project_status` (`Em desenvolvimento` e
`Concluído` coincidem, `Pausado` vs `Suspenso` não). Enum separado, de
propósito — é um status visual do marcador no mapa, não o status do projeto.

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
