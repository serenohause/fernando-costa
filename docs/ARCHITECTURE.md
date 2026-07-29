# Arquitetura do Projeto

> Decisões específicas deste domínio. O `CLAUDE.md` tem as convenções gerais
> que valem para qualquer projeto do template.

## Origem: migração do base44

Este projeto **não parte de um protótipo novo**. Ele é a reconstrução, em
React + Vite + TypeScript + Supabase, de um backoffice que já existe e roda
na plataforma base44, cujo código-fonte está em `projeto-original/`.

`projeto-original/` substitui `prototypes/` como **fonte da verdade visual e
de domínio**. As regras de fidelidade do `CLAUDE.md` valem integralmente
sobre ele: cor, tipografia, espaçamento, hierarquia, breakpoints e microcopy
migram como estão. Divergência sutil conta como bug de implementação, não
como polimento. Se algo no original parecer errado ao implementar, sinalizar
ao usuário e esperar decisão — nunca corrigir silenciosamente.

O que o original entrega hoje: 30 páginas (~13.6k linhas), ~14k linhas de
componentes, 16 entidades, 50 componentes shadcn/ui, 2 edge functions
(`gerenciarColaborador`, `aprovarColaborador`) e 1 agente de IA
(`assistente_backoffice`).

## Domínio

- **Tipo de sistema:** backoffice de gestão para escritório de arquitetura —
  CRM, funil comercial, contratos, execução de projetos, atividades da
  equipe, financeiro (a pagar / a receber), cadastro de fornecedores,
  orçamento por cliente e mapa geográfico de propriedades.
- **Público/usuários finais:** equipe interna do escritório. Seis funções,
  com visões bem diferentes do sistema:
  | Função | O que enxerga |
  |---|---|
  | Diretor | tudo, incluindo financeiro e equipe |
  | Coordenador | painel executivo, projetos, atividades do time que coordena |
  | Administrativo | operação + financeiro + equipe |
  | Financeiro | recebíveis, pagamentos, painel executivo |
  | Arquiteto | apenas "Minhas Atividades" e projetos onde é responsável |
  | Estagiário | mesmo recorte do Arquiteto |
- **O que representa um tenant aqui:** um **escritório de arquitetura**.
  O escritório Fernando Costa é o primeiro tenant. Todo dado de negócio —
  cliente, negociação, contrato, projeto, tarefa, lançamento financeiro,
  fornecedor, colaborador — pertence a exatamente um escritório e nunca
  atravessa a fronteira.

O sistema original é single-tenant (nenhuma entidade tem `tenant_id`).
A migração introduz multitenancy desde o início — decisão explícita do
usuário, para não pagar uma migration dolorosa depois.

## Entidades centrais

As 16 entidades do base44, agrupadas por módulo. Todas ganham `tenant_id`;
as exceções estão marcadas e justificadas.

### Fundação (auth, equipe, permissões)

| Entidade | Descrição | Tem tenant_id? |
|---|---|---|
| `tenants` | O escritório. Tabela nova, não existe no original. | — (é a raiz) |
| `Collaborator` | Membro da equipe: nome, `role`, `area`, coordenador responsável, status (Ativo/Férias/Afastado). Ligado a um usuário do Supabase Auth. | Sim |
| `PermissoesUsuario` | Matriz colaborador × menu × (`pode_visualizar`, `pode_editar`). | Sim |
| `SolicitacaoAcesso` | Fila de aprovação: quem tentou entrar e ainda não é colaborador ativo. | Sim |

### Comercial

| Entidade | Descrição | Tem tenant_id? |
|---|---|---|
| `Client` | CRM. Pessoa física ou jurídica, origem do lead, CPF/CNPJ (com campos normalizados para deduplicação). | Sim |
| `Negociacao` | Pipeline. Etapas: Lead recebido → Qualificado → Proposta enviada → Em negociação → Fechamento. Status Ativa/Ganha/Perdida, com motivo de perda. | Sim |
| `ClientIntake` | Formulário público de briefing, acessado por token com validade de 24h. Preenchido pelo **cliente final**, sem login. | Sim (mas com política de acesso anônimo por token — ver abaixo) |

### Entrega

| Entidade | Descrição | Tem tenant_id? |
|---|---|---|
| `Contract` | Contrato assinado: tipo, valor total, forma de cobrança, parcelamento. | Sim |
| `Project` | Projeto em execução. Status (Prospecção → … → Concluído) e fase atual (Briefing → Layout → Perspectivas → … → Alvará). Responsável comercial e responsável operacional são pessoas diferentes. | Sim |
| `Task` | Etapa do fluxo do projeto, por fase. | Sim |
| `Atividade` | Trabalho atribuído a um colaborador, com prazo e coordenador. Base do relatório de produtividade. | Sim |
| `PropriedadeMapa` | Coordenadas geográficas de terreno/obra, para o mapa de projetos. | Sim |

### Financeiro e suprimentos

| Entidade | Descrição | Tem tenant_id? |
|---|---|---|
| `AccountReceivable` | Parcela a receber, ligada a contrato/projeto/cliente. | Sim |
| `AccountPayable` | Despesa a pagar, com categoria e recorrência. | Sim |
| `FinancialCategory` | Categoria de receita/despesa por centro de custo. | Sim |
| `Fornecedor` | Fornecedor por tipologia, com modelo de parceria e comissão. | Sim |
| `ChecklistOrcamento` | Checklist de orçamento por cliente/projeto, com valor estimado, aprovado e comissão. | Sim |

## Primeira feature (fatia vertical de validação)

**Fundação de acesso**: Supabase Auth → `tenants` → `Collaborator` →
`PermissoesUsuario` → `SolicitacaoAcesso` → shell de navegação com o menu
filtrado por permissão.

É a fatia certa porque nenhum outro módulo funciona sem ela: no original,
o `Layout.jsx` filtra os itens de menu por `role` + `PermissoesUsuario`
antes de renderizar qualquer página, e usuário sem colaborador ativo cai na
tela de acesso pendente.

## Ordem dos módulos

Cada módulo é uma fatia vertical completa:

1. schema (migration)
2. RLS + teste de isolamento
3. seed de dados simulados no escritório de teste
4. hooks em `src/features/<modulo>/hooks.ts`
5. UI fiel ao original
6. auditoria de segurança
7. **deploy**

Um commit por camada. O módulo só é dado por encerrado depois de o usuário
ver a tela funcionando com o dado simulado **e do deploy no ar**.

A auditoria (6) não é opcional antes do deploy: é a condição que
`.claude/skills/deploy/SKILL.md` impõe, e existe porque o deploy é o momento
em que o sistema passa a ser alcançável por quem não foi convidado. Achado
crítico ou alto em aberto trava o deploy até ser corrigido ou até o usuário
reconhecer o risco explicitamente.

O dado real do base44 é importado **no fim de tudo** (ver
`docs/SCHEMA-PLAN.md`) — as colunas `legacy_id` já nascem prontas para isso
desde a primeira migration.

O ambiente de deploy é Vercel (frontend) sobre o mesmo projeto Supabase
hospedado. Como não há ambiente de staging separado, **o que está no ar é o
mesmo banco que o desenvolvimento usa**. Enquanto o banco só tem o
escritório de teste, isso é aceitável. Deixa de ser no momento em que o dado
real do cliente entrar: aí é obrigatório separar produção de
desenvolvimento em dois projetos Supabase, e essa separação precisa
acontecer **antes** da importação, não depois.

1. **Fundação** — auth, tenants, Collaborator, PermissoesUsuario, SolicitacaoAcesso, shell de navegação.
2. **CRM** — Client, ClientDetail.
3. **Pipeline** — Negociacao, ClientIntake (formulário público).
4. **Contratos** — Contract.
5. **Projetos** — Project, Task (fluxo do projeto).
6. **Atividades** — Atividade, MinhasAtividades, RelatorioProdutividade.
7. **Financeiro** — AccountReceivable, AccountPayable, FinancialCategory.
8. **Fornecedores e Orçamento** — Fornecedor, ChecklistOrcamento.
9. **Mapa** — PropriedadeMapa, MapaProjetos.
10. **Dashboards** — Dashboard, DashboardExecutivo, DashboardComercial. Por último: agregam dado de todos os módulos anteriores.

## Ambiente de banco

**Sem Supabase local em Docker.** O desenvolvimento aponta direto para o
projeto Supabase hospedado. O token da CLI (`SUPABASE_ACCESS_TOKEN`) vem do
`direnv`, fora do repositório; a URL e a `anon key` do projeto ficam no
`.env`.

Consequências que precisam ser respeitadas:

- **`supabase db reset` não é usado.** Contra um projeto hospedado ele apaga
  o banco inteiro. Por isso não existe script `db:reset` no `package.json` —
  se um dia for necessário, é comando digitado à mão.
- **Migration aplicada é aplicada de verdade.** Não há ambiente descartável
  para errar. Toda migration é revisada antes do `db:push`, e nenhum
  subagente aplica nada no banco — quem aplica é o usuário.
- **Os testes de isolamento de RLS rodam contra o banco real.** Para não
  deixar sujeira, cada teste roda dentro de uma transação com `ROLLBACK` no
  fim, e usa dados marcados como de teste. Isso vale enquanto o banco não
  tiver dado de produção; quando o dado real do base44 entrar, os testes
  passam a exigir um projeto separado de staging.
- **O Auth Hook que escreve o `tenant_id` no JWT precisa ser ligado no
  painel** (Authentication > Hooks). O `config.toml` sozinho só configura
  ambiente local, que aqui não existe. **Já está ligado**, apontando para
  `public.custom_access_token_hook`, e o caso 0.1 de
  `supabase/tests/rls-isolation.mjs` acusa se alguém desligar.
- **Tabela nova em `public` NÃO nasce fechada — nasce fechada só a partir da
  migration 0007.** O bootstrap do Supabase deixa um `ALTER DEFAULT PRIVILEGES`
  pendurado no papel `postgres` que concede `GRANT ALL` a `anon` e
  `authenticated` em toda tabela criada em `public`. As migrations 0002–0005
  caíram nessa: as sete tabelas da fundação ficaram legíveis e graváveis pela
  chave publicável até a 0007 revogar tudo e desarmar o default. Consequência
  para os próximos módulos: **`ENABLE ROW LEVEL SECURITY` sozinho não protege
  nada se o `GRANT` estiver aberto, e `GRANT` sozinho não protege nada se a RLS
  estiver desligada** — toda tabela nova precisa dos dois, escritos à mão ao
  lado da policy, e de um teste que prove com a chave publicável que a tabela
  não responde.

## Desvios do padrão do CLAUDE.md

- **Sem etapa de protótipo HTML.** `projeto-original/` cumpre o papel de
  `prototypes/`. O gate de aprovação da etapa 2 do `/start-project` foi
  substituído pela decisão do usuário de usar o original como referência.
- **shadcn/ui + Radix entram no stack.** O original é construído sobre eles;
  reescrever 50 componentes de UI do zero quebraria a fidelidade visual sem
  ganho. Os tokens de tema (`--background`, `--primary`, `--sidebar-*`, …)
  são portados do `index.css` v3 para o `@theme` do Tailwind v4, mantendo os
  mesmos valores HSL. Divergência de cor/espaçamento em relação ao original
  é bug, não escolha.
- **Bibliotecas herdadas do original**, mantidas onde a tela depende delas:
  `recharts` (dashboards), `react-leaflet` + `@react-google-maps/api`
  (mapa), `@hello-pangea/dnd` (kanban do pipeline), `framer-motion`
  (transições de rota), `date-fns`, `jspdf` + `jspdf-autotable`
  (exportação), `react-hook-form` (formulários grandes), `sonner` (toasts).
- **Desnormalização do base44 não é portada.** O original guarda
  `client_id` + `client_name` lado a lado, sem FK, porque o base44 não tem
  join. No Postgres isso vira FK + join. Onde o valor precisa ser
  historicamente congelado (nome do cliente no contrato assinado), a cópia
  é mantida **de propósito** e documentada na migration.

## Autenticação e notificações — decisões do usuário

**Login por e-mail e senha.** O `projeto-original/` não tem tela de login: a
plataforma base44 autenticava antes de o app carregar, e o código só recebia
`base44.auth.me()`. A tela foi construída seguindo o padrão que o original já
usa nas telas de autenticação fora do shell (`SolicitarAcesso.jsx`,
`AcessoPendente.jsx`) — degradê slate, cartão `max-w-md`, bloco escuro com
ícone, botão `slate-900` de largura cheia. Não é design novo; é a mesma
linguagem aplicada a uma tela que faltava.

**Sem provedor de e-mail, por ora.** O original manda e-mail em três momentos
(solicitação de acesso registrada, acesso aprovado, convite de colaborador),
todos via `base44.integrations.Core.SendEmail`. Não há equivalente no
Supabase para e-mail transacional arbitrário, e a decisão foi seguir sem
provedor por enquanto. Consequências:

- A fila de solicitações continua funcionando: o pedido é registrado e
  aparece na tela de Controle de Acesso. O que não acontece é o aviso.
- Alguém precisa olhar a tela — ninguém é notificado.
- **A copy das telas que prometiam e-mail foi alterada**, com aprovação do
  usuário. É a única divergência deliberada de texto em relação ao original
  até aqui: uma tela que promete e-mail e não manda faz a pessoa esperar
  indefinidamente por algo que não vem.
- Quando um provedor for escolhido (Resend ou SMTP do escritório), a copy
  original volta junto com o envio.

## Fora de escopo (decisão do usuário)

- **Páginas de marketing**: `LeadsMarketing`, `Campanhas`, `Conteudos`,
  `MidiaPaga`, `RelatoriosMarketing`, `MetasComerciais`. São stubs mortos —
  chamam entidades que não existem no base44
  (`base44.entities.LeadMarketing?.list()`), e `MetasComerciais.jsx` tem
  zero linhas.
- **`Collaborator.senha_temporaria`**: o original guarda senha em texto
  puro. Não é portado. Onboarding de colaborador passa a ser convite por
  e-mail do Supabase Auth.

## Pontos de atenção herdados do original

- **`PermissoesUsuario.menu` é texto livre e está corrompido.** O enum tem
  `Negoциações` (com caracteres cirílicos) e `Aprova​ções` (com
  zero-width space), além de duplicatas semânticas (`Clientes` vs `CRM`,
  `Contratos` vs `Contratos & Propostas`). Na migração vira `menu_key`
  com slug ASCII estável, e o rótulo em português fica só na UI.
- **Autorização hoje é só frontend.** O `Layout.jsx` esconde itens de menu,
  mas nada impede a chamada direta à entidade. No Supabase, a autoridade
  passa a ser a RLS; o frontend só trata o erro de acesso negado.
- **`ClientIntake` é público por token.** Precisa de política própria:
  leitura/escrita anônima restrita ao registro cujo token bate e cuja
  validade de 24h não expirou. É o único ponto do sistema onde dado é
  gravado sem sessão autenticada — trata como superfície de ataque.
- **`projeto-original/` está no `.gitignore`.** A fonte da verdade visual
  não está versionada. Se o original mudar ou sumir, a referência de
  fidelidade some junto.

## Status

- [x] Domínio definido
- [ ] Plano de schema aprovado
- [ ] Scaffold criado
- [x] Auth + RLS + isolamento validado (módulo 1; `supabase/tests/`, rodado
      contra o banco hospedado — 95 casos em SQL, 93 ponta a ponta)
- [ ] Primeira feature implementada
- [ ] Auditoria de arquitetura rodada
- [ ] Deploy em produção
