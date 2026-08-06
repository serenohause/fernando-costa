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

### Do módulo 4 em diante: o que se testa, e o que parou de se testar

O trabalho continua **módulo a módulo**, na ordem da tabela acima. O que muda
é a validação, e o motivo é medido: os três primeiros módulos custaram cerca
de doze horas, e boa parte foi rigor aplicado ao que já estava provado. O
módulo 2 produziu 189 casos de teste e o módulo 3 produziu 213 — para o mesmo
padrão, aplicado a tabelas diferentes.

O que era genuinamente novo já aconteceu: multitenancy, permissão de menu
virando regra de escrita no banco, e a porta pública sem autenticação.
**Nenhum módulo restante abre superfície nova.** São tabela com `tenant_id`,
leitura por colaborador ativo, escrita por `can_edit_menu`, e telas.

#### O que continua

**A suíte de invariantes** (`npm run test:pattern`). Módulo novo acrescenta
uma linha em `pattern_tables` e ganha 26 asserções: RLS ligada, anônimo sem
privilégio, policy nos quatro comandos, `WITH CHECK` declarado, `tenant_id`
not null, `unique (id, tenant_id)`, índice por `tenant_id`, isolamento entre
escritórios nos dois sentidos, colaborador afastado sem leitura, escrita
presa ao menu certo, e a chave de menu sendo de fato lida.

Ela é o que sustenta todo o resto do corte, e por isso foi validada por
mutação: acesso anônimo derruba 2 casos, RLS desligada derruba 9, leitor
ganhando permissão derruba 3. Se ela deixar de cair quando o padrão quebra,
o corte deixa de ser seguro.

**Teste próprio do módulo, curto** — só a regra de negócio que a suíte não
tem como conhecer: coluna gerada, restrição de unicidade, check de domínio,
valor calculado. Alvo de 10 a 15 casos, não 44.

#### O que parou

- **Suíte de RLS por módulo.** As 71 do CRM mais as 52 de ponta a ponta
  reafirmavam o que a suíte de invariantes já afirma sobre a mesma tabela.
- **Injeção de defeito por módulo.** Vale uma vez, para validar o padrão —
  e já valeu. Repetir por módulo reprova o que já foi provado.
- **Agente de auditoria por módulo.** Só quando algo sai do padrão.

#### Quando o corte não vale

Qualquer coisa que fuja do padrão volta ao tratamento completo, com auditoria
dedicada e injeção de defeito: escrita sem sessão autenticada, dado vindo de
terceiro, superfície pública, ou cálculo cujo erro só apareceria no dinheiro
de alguém. Foi assim que o formulário público do módulo 3 ganhou suíte
própria — e foi lá que apareceu o achado que travou o deploy.

O julgamento é meu, e é declarado antes de começar o módulo, não depois.

### Como os módulos 3 a 9 são feitos (mudou depois do 2)

Os módulos 1 e 2 produziram ~114 asserções cada. No 1 isso se pagou: achamos
tabela aberta para a internet, chave-mestra válida até 2036 e três caminhos
de escalação de privilégio. No 2 foi rigor repetido — o mesmo padrão aplicado
a uma tabela — e levou mais de uma hora só na parte de banco.

Do módulo 3 em diante:

1. **Um agente por módulo faz schema e RLS juntos.** São acoplados: a RLS
   depende das colunas, e verificar coluna gerada ou restrição sem aplicar não
   verifica nada. Dois agentes sequenciais custavam uma rodada de ida e volta
   sem ganho.
2. **Os invariantes do padrão têm suíte única e parametrizada**, em
   `supabase/tests/pattern-invariants.sql` (`npm run test:pattern`). Ela roda
   sobre toda tabela de negócio de todo módulo e afirma: RLS ligada, anônimo
   sem privilégio, os quatro comandos com policy, `WITH CHECK` declarado,
   `tenant_id` not null, `unique (id, tenant_id)` para FK composta, índice
   começando por `tenant_id`, isolamento entre escritórios nos dois sentidos,
   colaborador afastado sem leitura, escrita presa ao menu certo, e a chave de
   menu sendo de fato lida. Módulo novo acrescenta **uma linha** em
   `pattern_tables` e ganha as 26 asserções.
3. **Teste próprio do módulo cobre só o que é específico dele** — coluna
   gerada, restrição de unicidade, superfície pública por token, regra de
   negócio. Curto, e sobre o que o padrão não alcança.

A suíte de invariantes foi validada por mutação: acesso de leitura para
anônimo derruba 2 casos, RLS desligada derruba 9, leitor ganhando permissão
de editar derruba 3. Suíte verde que não acusa defeito injetado não é suíte —
e este projeto já produziu cinco asserções vazias antes de adotar essa
checagem.

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

### Os dez módulos

| # | Módulo | Entidades | Estado |
|---|---|---|---|
| 1 | **Fundação** | tenants, collaborators, menus, collaborator_permissions, access_requests | **no ar** |
| 2 | CRM | Client, ClientDetail | a fazer |
| 3 | Pipeline | Negociacao, ClientIntake (formulário público) | a fazer |
| 4 | Contratos | Contract | a fazer |
| 5 | Projetos | Project, Task (fluxo do projeto) | a fazer |
| 6 | Atividades | Atividade, MinhasAtividades, RelatorioProdutividade | a fazer |
| 7 | Financeiro | AccountReceivable, AccountPayable, FinancialCategory | a fazer |
| 8 | Fornecedores e Orçamento | Fornecedor, ChecklistOrcamento | a fazer |
| 9 | Mapa | PropriedadeMapa, MapaProjetos | a fazer |
| 10 | Dashboards | Dashboard, DashboardExecutivo, DashboardComercial | a fazer |

Dashboards ficam por último de propósito: agregam dado de todos os módulos
anteriores, e construí-los antes significaria refazê-los a cada módulo novo.

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
  para errar.
- **Quem pode aplicar, e sob quais limites.** Um subagente pode rodar
  `supabase db push` das migrations que ele mesmo escreveu, e pode criar dado
  de teste. Não pode: `supabase db reset`, `DROP` de qualquer objeto criado
  por migration anterior, alterar dado do seed, nem `git push`. Escrita de
  teste roda dentro de transação com `ROLLBACK` — um agente já alterou a
  função de um colaborador do seed por testar sem transação, e a reversão
  manual funcionou por sorte, não por desenho.
  Aplicar no banco é decisão de quem orquestra, tomada por tarefa: quando o
  passo depende de verificar comportamento real (RLS, coluna gerada,
  restrição de unicidade), verificar sem aplicar não verifica nada.
- **Migration já aplicada não é editada.** Nem para corrigir comentário. O
  arquivo passa a divergir do que o banco recebeu, e a próxima máquina a
  aplicar do zero pega um schema diferente do que está em produção. Correção
  vira migration nova. Aconteceu uma vez na 0015 (só `COMMENT ON`, com o
  banco atualizado à mão para bater) — está registrado como dívida, não como
  precedente.
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

## Segurança — estado e decisões

Auditoria do módulo 1 rodada antes do primeiro deploy. Resumo do que foi
fechado e do que segue aberto por decisão.

### Fechado

**Tabelas abertas para a internet.** As tabelas criadas pelas migrations
0002–0005 receberam privilégio total para `anon` e `authenticated` sem que
nenhuma migration pedisse: o bootstrap do Supabase deixa um
`alter default privileges ... grant all on tables to anon, authenticated`
pendurado no papel `postgres`, e migration roda como `postgres`. Leitura,
escrita e `DELETE` funcionavam com a chave publicável — a que vai no
navegador. A 0007 revoga e desarma o default. **Regra que fica: RLS sem
`GRANT` dá "permission denied"; `GRANT` sem RLS entrega a tabela. Precisa
dos dois, escritos à mão, em toda tabela nova.**

**Chaves de API legadas.** O projeto nascia com o formato antigo ativo ao
lado do novo, e a `service_role` legada era uma chave-mestra válida **até
2036**, sem rotação possível. Desligadas no módulo 1. O `.env` usa a chave
`sb_secret_`.

**Chave de ASSINATURA HS256 legada.** Fechada só no módulo 8, e por meses
esta seção afirmou que estava — o parágrafo acima falava de "chaves JWT
legadas" no plural e dava as duas coisas por resolvidas. Eram duas coisas
diferentes: desligar as chaves de **API** não mexe na chave de **assinatura
de JWT**.

A HS256 ficou com status `previously_used`. Chave nesse estado **continua
validando token** — e HS256 é simétrica, então o segredo que verifica é o
mesmo que assina. A auditoria do módulo 8 forjou um token com `tenant_id`
escolhido a mão, assinado com o segredo real do projeto, e leu dado vivo:
checklists, valores aprovados, comissões, fornecedores. Toda a RLS e toda
policy de storage ficavam de fora do caminho.

Revogada em 2026-08-04, com autorização explícita do usuário. Provado nos
dois lados depois da revogação: token forjado com o segredo real recebe
`401 "No suitable key was found to decode the JWT"`, e login legítimo (ES256)
lê o mesmo caminho com `200`. A revogação não derrubou sessão — as duas
chaves nasceram juntas em 2026-07-29 e a ES256 já era a `in_use`, então não
havia token HS256 legítimo em circulação.

**Por que 572 asserções não pegaram isso:** nenhuma tentava assinar nada.
Era o ponto cego que esta mesma doc registrava desde o módulo 1 — e ele
deixou de ser teórico exatamente aqui.

**Escalação de privilégio na própria linha.** Policy não fecha isso: o
`WITH CHECK` não enxerga o estado anterior da linha. Um gestor podia trocar a
própria `role`, criar linha já vinculada ao próprio `user_id`, ou soltar o
próprio `user_id` e colá-lo na linha de um Diretor. Fechado por trigger que
compara antes e depois.

**Gestão de equipe restrita a Diretor.** A matriz do `SCHEMA-PLAN.md` dizia
"Diretor e Administrativo" — erro de leitura do original, onde `admin` é
papel de plataforma do base44 e não o `Administrativo` do escritório.

### Aberto por decisão do usuário

**Cadastro aberto (`disable_signup: false`).** Qualquer pessoa cria conta no
projeto. Hoje não enxerga nada — sem vínculo em `tenant_users` não há claim,
e sem claim a RLS não devolve linha (provado em teste). Mantido enquanto o
fluxo de criação de usuário não for definido.

Risco que aparece com o domínio real, e que precisa ser resolvido **antes**
da importação: `register-access-request` vincula automaticamente quem entra
com um e-mail que já está em `collaborators`. Se essa linha estiver `active`,
a pessoa entra **sem passar por aprovação de Diretor**. Hoje é teórico
porque o domínio de teste é fictício e o Supabase recusa cadastro em domínio
inexistente. Com o domínio do escritório, deixa de ser.

**Financeiro é legível por qualquer colaborador ativo do escritório.** Achado
médio da auditoria do módulo 7, e o usuário decidiu manter — "faça da forma que
está no original". É de fato o original: as entidades do base44 não declaram
restrição de leitura, e nem `AccountsReceivable.jsx` nem `AccountsPayable.jsx`
checam permissão em lugar nenhum. A permissão de menu só **esconde** o item da
barra lateral; ela não guarda a rota, e `redirectTargetFor` só redireciona papel
individual (arquiteto, estagiário).

Provado com login real: o coordenador Rafael, com `receivables can_view = false`,
leu as 28 parcelas e a soma de R$ 693.000. "Exportar PDF" também não é gated —
quem abre a tela exporta a carteira.

Se um dia o escritório quiser financeiro só para Diretor, Administrativo e
Financeiro, o lugar do recorte é a policy de SELECT (migration 0042, comentário
corrigido pela 0047), não a tela.

**Uma requisição pode gerar até 32.767 linhas de dinheiro.** Achado médio da
auditoria do módulo 7, mantido por decisão do usuário — "deixar como o original".
Nem `installment_count` nem `recurrence_count` têm teto de negócio: o limite é o
do `smallint`. O `max="24"` do formulário original é atributo de navegador, não
regra. Provado no banco: 32.767 parcelas geradas, último vencimento em 4757, 4,1
segundos.

O caminho da recorrência é herdado literalmente
(`projeto-original/src/pages/AccountsPayable.jsx:171` faz `count || 120`).
Agrava, e não estava no original: não há exclusão em lote de recebível na tela, e
o contrato não pode mais ser apagado enquanto tiver parcelas (FK sem cascade, por
decisão consciente — apagar contrato não apaga dinheiro em silêncio). Desfazer um
dedo errado é linha a linha.

**Orçamento e PDF de aprovação são legíveis por qualquer colaborador ativo.**
Achado médio da auditoria do módulo 8. Mesma classe da leitura larga já
aceita no módulo 7, e coerente com a decisão do usuário lá ("faça da forma
que está no original") — no base44 não há checagem de permissão em tela
nenhuma, e o arquivo é URL **pública**. A nossa versão é estritamente mais
apertada: bucket privado, isolado por tenant, URL assinada com 5 min.

O que fica largo é a leitura: arquiteto e estagiário leem valores, comissões
por fornecedor, e **baixam o PDF de aprovação de compra do cliente** — o
documento mais sensível do módulo. Provado com login real da arquiteta
Camila, com `client_budget` e `suppliers` em `can_view = false` nos dois.
Escrita continua presa a `can_edit` (coordenador e administrativo barrados,
provado).

Se o escritório quiser restringir, o recorte é em dois lugares que precisam
concordar: a policy de SELECT das tabelas (0050/0054) **e** a policy de
SELECT do bucket (0052). Mexer só numa das duas cria uma tela que lista o
anexo e não abre, ou o contrário.

**Arquivo órfão no Storage.** Pendência declarada na migration 0052, com o
tamanho medido na auditoria do módulo 8. Storage não tem FK: apagar item,
cotação ou checklist não apaga o objeto. Os hooks varrem os caminhos antes do
DELETE, mas é best-effort — e `remove()` sem permissão **falha em silêncio**
(devolve sucesso com zero apagados). Órfão custa armazenamento e continua
alcançável por caminho dentro do próprio escritório; **não** atravessa tenant
(provado). Fechar de verdade pede faxina que compare bucket com banco.

**Onde o cliente mora é legível por qualquer colaborador ativo.** Achado médio
da auditoria do módulo 9, e a terceira vez que esta decisão aparece — mesma
classe já aceita no financeiro (módulo 7) e no orçamento (módulo 8), e coerente
com a instrução do usuário de ser fiel ao original, que não checa permissão em
tela nenhuma.

O que muda de grau aqui é o dado: coordenada com precisão de cerca de 11 cm,
endereço formatado, loteamento, quadra e lote. Provado com login real da
arquiteta Camila, com `map can_view = false`: leu os 12 pinos e as 30 tags. A
permissão de menu só esconde o item da barra lateral, e `/MapaProjetos` não
está na lista de redirecionamento de papel individual.

Se o escritório quiser apertar, o lugar é a policy de SELECT da migration 0058,
por `auth_collaborator_role()`.

**Painel: o rótulo diz de quem é o número.** Achado alto da auditoria do módulo
10, corrigido antes do deploy. Duas coisas empilhadas:

1. **`can_view` em `activities` não concedia nada.** A policy da 0038 só honrava
   `can_edit_menu`, e a própria migration assumiu por escrito que Administrativo
   receberia `can_edit` no seed — o seed dá `can_view` apenas. Resultado: o menu
   "Atividades" aparecia para o Administrativo e a lista vinha vazia. Corrigido
   pela **0059**, que faz `can_view` conceder leitura ampla, como no original
   (lá `pode_visualizar` mostra o menu e `Atividade.list()` devolve tudo — não
   existe leitura parcial). A escrita não mudou.

   Por que 650 asserções não pegaram: o caso C5 da suíte de padrão ("quem tem
   apenas can_view LÊ") usava fixture no nome do próprio leitor, então passava
   pelo ramo do responsável e não afirmava nada sobre `can_view`. A fixture foi
   corrigida e a asserção provada com dente — com a policy velha, ela falha.

2. **Os cartões de atividade do Painel Executivo mostravam a carga de quem
   olhava, com rótulo de escritório.** Depois da 0059 sobra o caso de quem não
   tem nenhuma permissão no menu — no seed, o Financeiro, para quem o Executivo
   é o único painel liberado. "Atrasadas: 0" ficava indistinguível de
   "escritório em dia".

   O original não tem resposta para isso (lá todos liam tudo, e o rótulo nunca
   mentia), então valeu a instrução do usuário de resolver da melhor forma: o
   rótulo passa a dizer o escopo ("Minhas atividades atrasadas") quando a
   leitura é pessoal, e fica idêntico ao original quando é ampla. Nenhum número
   muda, nada é escondido, nenhuma trava nova.

### Ponto cego dos testes — fechado no módulo 8

Ficou aberto do módulo 1 ao 7, escrito aqui o tempo todo: as suítes provavam
que a RLS segura **token legítimo**, e nenhuma exercitava token forjado.
Passavam 100% enquanto o sistema era falsificável. Não era asserção vazia —
era escopo faltando.

Deixou de ser teórico na auditoria do módulo 8 (ver "Chave de ASSINATURA
HS256 legada", acima). Fechado por `supabase/tests/forged-token.mjs`
(`npm run test:forged`, 9 casos):

- nenhuma chave HS256 fora de `revoked`, e existe chave assimétrica `in_use`
- token HS256 assinado com o **segredo real do projeto** é recusado em quatro
  tabelas de módulos diferentes
- token `alg:none` é recusado
- **controle positivo**: login legítimo lê o mesmo caminho e devolve `200`

Duas decisões de desenho que o arquivo carrega, e que valem para qualquer
teste de segurança futuro deste projeto:

1. **O segredo é o real, buscado na Management API.** Forjar com segredo
   adivinhado não prova nada — o `401` viria da assinatura errada, não da
   chave estar revogada, e o teste passaria para sempre mesmo com a chave
   religada. Este projeto já escreveu uma asserção vazia exatamente assim.
2. **Sem o segredo, o teste ABORTA em vez de pular.** Teste de segurança que
   se cala quando não consegue verificar vira um "passou" no relatório, que é
   pior que teste nenhum.

### Módulo 2 (CRM) — auditoria e o que ficou registrado

Auditoria focada, sem achado crítico ou alto. Os invariantes do padrão não
foram reauditados: têm suíte automatizada validada por mutação.

Fechado nesta rodada:

- **Cache do navegador atravessava troca de usuário.** `queryClient.clear()`
  só rodava no botão Sair. Sessão que termina por token expirado emite
  `SIGNED_OUT` sem passar por mutation, e o cache ficava de pé — outro
  colaborador logando na mesma aba dentro de 5 minutos recebia os dados do
  anterior enquanto o refetch corria. Não atravessa RLS; atravessa memória.
  Hoje o dano seria intra-escritório; com o segundo escritório seria dado
  pessoal cruzando tenant sem nenhuma falha de policy.
- **A listagem lia o cadastro inteiro.** `select('*')` mandava CPF, data de
  nascimento, endereços e observações de todos os clientes para qualquer
  colaborador ativo — inclusive para quem o redirecionamento de rota manda
  para fora do CRM, porque a API não redireciona ninguém. A listagem passou a
  pedir as oito colunas que exibe; editar busca o cadastro no clique.
- **`*` não era escapado na busca.** O PostgREST traduz `*` em `%` nos
  operadores `like`/`ilike`, então digitar `*` listava o escritório inteiro.
- **Mensagem crua do Postgres aparecia na tela de erro**, descrevendo schema.
  Passou a mostrar o código; a mensagem vai para o console.
- **Trava do seed filtrava no cliente**, dependendo de a lista de tenants vir
  inteira. Passou a perguntar ao banco.
- **"Diretor afastado não escreve" existia só em comentário.** Agora tem
  quatro casos de teste, incluindo Diretor de férias e a recusa da própria
  policy.

Aberto e registrado como decisão:

- **O termo de busca viaja na query string**, e o campo pede explicitamente
  CPF/CNPJ. Isso põe documento de cliente nos logs de request do projeto
  Supabase, com a retenção dele. Não é exposto a usuário — é log de quem
  administra o projeto. Com dado real isso é assunto de proteção de dados
  pessoais, não de RLS. A saída é mover a busca para RPC via POST; fica
  registrado como pendência da etapa de importação, não do módulo.
- **Leitura de cliente é larga**: qualquer colaborador ativo lê nome, CPF,
  telefone, e-mail, data de nascimento e os dois endereços de todos os
  clientes. É o recorte aprovado e é o que o original faz. O caso 6.C2 de
  `crm-rls.sql` é o que vai acusar se alguém apertar isso um dia.

### Obrigatório antes da importação do dado real

> **A importação já aconteceu** (`scripts/import-base44.mjs`, tenant
> `fernando-costa`). O estado desta lista no momento em que o dado real entrou:
>
> | Item | Estado |
> |---|---|
> | Separar produção de desenvolvimento em dois projetos Supabase | **NÃO FEITO.** O dado real convive com os dois escritórios de teste no mesmo projeto. É o item aberto de maior gravidade. Mitigação parcial: os dez seeds abortam neste banco desde que o tenant real nasceu, e a conferência da importação prova que nenhum `legacy_id` do base44 caiu em outro tenant. |
> | Restringir acesso ao banco por rede | **NÃO FEITO.** |
> | Apagar as contas de teste do seed | **NÃO FEITO.** As 12 contas de teste (senhas conhecidas, em `supabase/seed/credenciais*.local`) continuam ativas no mesmo projeto Auth. |
> | Resolver cadastro aberto + auto-vínculo | **NÃO FEITO.** |
> | Cadastrar o domínio de e-mail real em `tenant_email_domains` | **DECIDIDO NÃO FAZER**, e o motivo é o dado: são 7 domínios para 15 pessoas, 11 delas com e-mail pessoal. A unicidade de `domain` é global — cadastrar `gmail.com` rotearia qualquer usuário de Gmail do mundo para este escritório. O acesso é por conta criada com senha inicial e vinculada ao colaborador por `legacy_id`; o auto-cadastro por domínio não é usado por este escritório. |
> | Garantir mais de um Diretor | **FEITO.** O export tem três Diretores ativos, os três com login. |
> | Decidir o que fazer com o Nominatim | **NÃO FEITO**, e agora vale para dado real: 218 pinos de propriedade de cliente estão no banco. |
> | Configurar a chave do Google antes de existir chave | Sem mudança: a variável continua não existindo. |

Nenhum destes bloqueia o deploy do escritório de teste, e todos bloqueiam a
entrada de dado de produção:

- Separar produção de desenvolvimento em dois projetos Supabase.
- Restringir o acesso ao banco por rede — hoje aceita conexão de qualquer IP.
- Apagar as contas de teste do seed (senhas conhecidas, em
  `supabase/seed/credenciais.local`).
- Resolver o cadastro aberto + auto-vínculo descrito acima.
- Cadastrar o domínio de e-mail real em `tenant_email_domains` **antes** de
  qualquer pessoa tentar entrar: sem ele, o Supabase recusa o cadastro e o
  erro não explica o motivo.
- Garantir mais de um Diretor no escritório. Diretor é o único papel que
  gerencia equipe, e Diretor afastado não lê nada — escritório com um
  Diretor só fica sem quem administre se ele se afastar.
- **Decidir o que fazer com o Nominatim.** A tela do mapa manda para
  `nominatim.openstreetmap.org` a coordenada exata clicada — que é onde fica o
  terreno ou a residência do cliente — e o texto digitado na caixa de busca,
  que o microcopy convida a preencher com endereço. Vai do navegador do
  colaborador direto para a OpenStreetMap Foundation, fora do Brasil, sem
  contrato e sem DPA, com o IP de quem clicou. É o comportamento do original.

  Hoje é médio porque o dado é fictício. **Com dado real vira transferência
  internacional de dado de localização de pessoa física** — mesma classe do CPF
  na query string, já listado aqui. Saídas: proxy em Edge Function, instância
  própria de Nominatim, ou aceite explícito registrado nesta doc.

  Vale lembrar que os tiles têm o mesmo caminho, em grau menor:
  `tile.openstreetmap.org` e `server.arcgisonline.com` (Esri) recebem o
  enquadramento do mapa, que está sempre centrado nas propriedades dos clientes.
- **Configurar a chave do Google antes de existir chave.** Se
  `VITE_GOOGLE_MAPS_API_KEY` for preenchida na Vercel, ela vai para o bundle —
  é o que o prefixo `VITE_` significa, e é assim em qualquer uso client-side do
  Google Maps. Antes disso, no console do Google Cloud: restrição por
  referenciador HTTP (só o domínio de produção) **e** restrição por API (só
  Geocoding). Sem as duas, a cota do escritório é de quem achar a chave.

  Hoje a variável não existe e nada vaza — conferido nos bundles local e de
  produção. E o caminho até ela é código morto: `geocodeAddress` só é chamada
  por `useGeocodeProjectSite`, que nenhuma tela chama ainda, porque o fluxo de
  "contrato aprovado gera projeto" está adiado. Ou seja: preencher a variável
  hoje só teria a desvantagem.

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
- [x] Deploy em produção (módulo 1, https://fernando-costa.vercel.app — ver a
      seção "Produção" do `README.md`)
