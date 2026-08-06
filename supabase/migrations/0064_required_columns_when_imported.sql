-- Seis colunas NOT NULL passam a aceitar nulo SO em linha importada do base44.
--
-- A MESMA REGRA DA 0062 E DA 0063, APLICADA A NOT NULL
--   NOT NULL nao aceita condicao: ou a coluna exige valor sempre, ou nao exige
--   nunca. Entao a obrigatoriedade se muda de lugar - sai do NOT NULL e vira
--   `check (<coluna> is not null or legacy_id is not null)`. O resultado, para
--   quem grava pela tela, e identico ao de hoje: sem valor, 23514 em vez de
--   23502. O que muda e que a linha do base44 passa a poder dizer "esse dado nao
--   existe mais", que e a verdade, em vez de ficar de fora inteira.
--
--   NULO AQUI NAO E INVENCAO - e o contrario dela. As alternativas eram apontar
--   o vinculo para outra pessoa/outro cliente (inventar um fato), ou recusar a
--   linha (perder todos os outros fatos que ela carrega).
--
-- OS SEIS CASOS
--
--   1-2. clients.address_city e clients.address_state (1 cliente). O cadastro do
--        base44 tem os campos e a linha esta vazia nos dois - e vazia em TODOS
--        os campos de endereco, inclusive os da obra, entao nao ha de onde
--        deduzir. Preencher "Fortaleza/CE" porque e onde o escritorio fica
--        seria gravar um endereco que ninguem informou. Com o cliente entra
--        tambem 1 negociacao que caia so por cascata dele.
--
--   3.   negotiations.funnel_entry_date (1 negociacao). A coluna e NOT NULL com
--        default current_date, e o default e a armadilha: deixar o banco
--        preencher gravaria "entrou no funil hoje" numa oportunidade de meses
--        atras, e a data de entrada e exatamente o que o relatorio de tempo de
--        funil mede. Nulo diz "nao foi registrado"; a data de hoje MENTE.
--
--   4.   negotiations.commercial_owner_id (15 negociacoes, UMA pessoa). O
--        vinculo e REAL - existia no base44, e o nome do responsavel esta la em
--        responsavel_comercial_name. O que falta e a linha do outro lado: essa
--        pessoa nao esta no export de Collaborator. Nulo aqui diz "o responsavel
--        nao esta mais cadastrado", que e a verdade. Com as 15 entram tambem 49
--        linhas de negotiation_services que caiam por cascata. SE o escritorio
--        recadastrar essa pessoa, a reimportacao religa as 15 sozinha pelo
--        legacy_id - e por isso que a saida certa e nulo, e nao um responsavel
--        substituto: substituto teria de ser desfeito a mao depois.
--
--   5.   client_intakes.client_id (18 briefings, 11 clientes). Formularios
--        gerados para clientes que depois sairam do CRM. O link publico
--        continua se comportando corretamente com client_id nulo:
--        open_client_intake (0026) faz JOIN com clients, e sem cliente o token
--        devolve 'not_found' - a mesma recusa indistinguivel de token
--        inexistente. Nada vaza e nada quebra; o briefing fica no historico do
--        escritorio, que e onde ele tem valor.
--
--   6.   activities.collaborator_id (1 atividade). Mesmo caso do 4: o
--        responsavel nao esta no export. A atividade fica sem dono, e isso tem
--        consequencia de LEITURA que precisa estar escrita: as policies da 0038
--        e da 0059 mostram atividade sem permissao de menu por
--        `collaborator_id = auth_collaborator_id()`, e nulo nunca e igual a
--        ninguem - entao essa atividade so aparece para quem tem can_view ou
--        can_edit em `activities`. E um recorte mais APERTADO, nao mais largo.
--
-- O QUE NAO MUDA
--   As FK compostas continuam iguais: quando ha valor, ele continua tendo de
--   existir no MESMO tenant. Nulo nao e ponteiro para lugar nenhum - e ausencia
--   de ponteiro, e a FK nao se aplica.
--
--   Os checks de "nao em branco" de clients continuam de pe e nao precisaram
--   mudar: `btrim(address_city) <> ''` e verdadeiro-desconhecido em nulo, entao
--   string vazia segue recusada para todo mundo, importada ou nao.
--
-- CONSEQUENCIA PARA O FRONTEND, QUE ESTA MIGRATION NAO PODE RESOLVER
--   `npm run db:types` passa a tipar estas seis colunas como anulaveis, e o
--   TypeScript vai acusar onde a tela assume que elas nao sao. Isso e o
--   compilador mostrando o que ja seria verdade em runtime. Os pontos conhecidos
--   estao no relatorio desta etapa.
--
-- POR QUE MIGRATION NOVA
--   A 0015, a 0022, a 0023 e a 0037 ja estao aplicadas. Migration aplicada nao
--   se edita (docs/ARCHITECTURE.md).

-- 1-2. clients.address_city / address_state ------------------------------------

alter table public.clients alter column address_city drop not null;
alter table public.clients alter column address_state drop not null;

alter table public.clients
  add constraint clients_address_city_required_check
  check (address_city is not null or legacy_id is not null);

alter table public.clients
  add constraint clients_address_state_required_check
  check (address_state is not null or legacy_id is not null);

comment on constraint clients_address_city_required_check on public.clients is
  'A cidade da residencia continua obrigatoria em todo cliente que NASCE AQUI - o passo 1 do cadastro do original pede nome, telefone e cidade. A EXCECAO EXISTE POR CAUSA DA IMPORTACAO e some quando legacy_id e nulo: 1 cliente do base44 nao tem endereco nenhum preenchido, nem o da residencia nem o da obra, e nao ha de onde deduzir a cidade. Substitui o NOT NULL da 0015, que nao aceita condicao. Ver o cabecalho da 0064.';

comment on constraint clients_address_state_required_check on public.clients is
  'Gemea de clients_address_city_required_check, pelo mesmo motivo e para o mesmo cliente. Ver o cabecalho da 0064.';

comment on column public.clients.address_city is
  'Cidade da residencia (current_city). Obrigatoria por check, e nao mais por NOT NULL: a partir da 0064 o NOT NULL saiu para que a linha importada do base44 sem endereco nenhum pudesse entrar. Para tudo que nasce nesta aplicacao a exigencia e a mesma de antes - o que muda e o codigo do erro, 23514 no lugar de 23502.';

comment on column public.clients.address_state is
  'UF da residencia (current_state). Mesma historia de address_city: obrigatoria por check desde a 0064, nula apenas em linha importada.';

-- 3. negotiations.funnel_entry_date --------------------------------------------

alter table public.negotiations alter column funnel_entry_date drop not null;

alter table public.negotiations
  add constraint negotiations_funnel_entry_date_required_check
  check (funnel_entry_date is not null or legacy_id is not null);

comment on constraint negotiations_funnel_entry_date_required_check on public.negotiations is
  'Data de entrada no funil obrigatoria em toda negociacao que NASCE AQUI, com o default de hoje preenchendo o caso normal. A EXCECAO EXISTE POR CAUSA DA IMPORTACAO e some quando legacy_id e nulo: 1 negociacao do base44 chega sem a data. DEIXAR O DEFAULT AGIR SERIA PIOR QUE O NULO - gravaria "entrou no funil hoje" numa oportunidade antiga, e o tempo de funil e exatamente o que essa coluna mede. Ver o cabecalho da 0064.';

comment on column public.negotiations.funnel_entry_date is
  'Data de entrada no funil (data_entrada_funil). Default de hoje, que e o que o formulario do original preenche sozinho, e obrigatoria por check desde a 0064 (era NOT NULL). Nula so em linha importada do base44, e ai significa "nao foi registrado" - a importacao NAO deixa o default agir, porque a data de hoje seria uma afirmacao falsa sobre um negocio antigo.';

-- 4. negotiations.commercial_owner_id ------------------------------------------

alter table public.negotiations alter column commercial_owner_id drop not null;

alter table public.negotiations
  add constraint negotiations_commercial_owner_required_check
  check (commercial_owner_id is not null or legacy_id is not null);

comment on constraint negotiations_commercial_owner_required_check on public.negotiations is
  'Responsavel comercial obrigatorio em toda negociacao que NASCE AQUI, como no original (responsavel_comercial_id e required). A EXCECAO EXISTE POR CAUSA DA IMPORTACAO e some quando legacy_id e nulo: 15 negociacoes do base44 apontam para UMA pessoa que nao esta no export de Collaborator. O vinculo era real; o que falta e a linha do outro lado. Nulo diz "o responsavel nao esta mais cadastrado" - e se o escritorio recadastrar a pessoa, a reimportacao religa as 15 pelo legacy_id, o que um responsavel substituto teria bloqueado. Ver o cabecalho da 0064.';

comment on column public.negotiations.commercial_owner_id is
  'Responsavel comercial (responsavel_comercial_id). Obrigatorio por check desde a 0064 (era NOT NULL); nulo apenas em linha importada cujo responsavel nao existe no export. FK composta com tenant_id - quando ha valor, ele continua tendo de ser colaborador DO MESMO escritorio. Trocar esta coluna e o evento que negotiation_owner_history registra.';

-- 5. client_intakes.client_id ---------------------------------------------------

alter table public.client_intakes alter column client_id drop not null;

alter table public.client_intakes
  add constraint client_intakes_client_id_required_check
  check (client_id is not null or legacy_id is not null);

comment on constraint client_intakes_client_id_required_check on public.client_intakes is
  'Todo briefing que NASCE AQUI pertence a um cliente do CRM: o link so e gerado quando a negociacao vira Ganha, e a tela exige cliente vinculado antes disso. A EXCECAO EXISTE POR CAUSA DA IMPORTACAO e some quando legacy_id e nulo: 18 links do base44 foram gerados para 11 clientes que depois sairam do CRM. A SUPERFICIE PUBLICA CONTINUA CORRETA com client_id nulo - open_client_intake (0026) faz JOIN com clients, entao o token devolve not_found, a mesma recusa indistinguivel de token inexistente. Ver o cabecalho da 0064.';

comment on column public.client_intakes.client_id is
  'Cliente do CRM a que este briefing pertence (cliente_crm_id). Obrigatorio por check desde a 0064 (era NOT NULL); nulo apenas em link importado cujo cliente nao existe mais. NUNCA sai na resposta publica - o que a tela publica exibe e o NOME, resolvido no servidor pelo join dentro de open_client_intake, e sem cliente o link deixa de abrir.';

-- 6. activities.collaborator_id -------------------------------------------------

alter table public.activities alter column collaborator_id drop not null;

alter table public.activities
  add constraint activities_collaborator_id_required_check
  check (collaborator_id is not null or legacy_id is not null);

comment on constraint activities_collaborator_id_required_check on public.activities is
  'Toda atividade que NASCE AQUI tem responsavel - e o campo que a tela usa para distribuir trabalho. A EXCECAO EXISTE POR CAUSA DA IMPORTACAO e some quando legacy_id e nulo: 1 atividade do base44 aponta para um colaborador que nao esta no export. EFEITO NA LEITURA, e ele APERTA em vez de afrouxar: as policies da 0038/0059 concedem leitura sem permissao de menu por collaborator_id = auth_collaborator_id(), e nulo nunca e igual a ninguem, entao essa atividade so e visivel para quem tem can_view ou can_edit em activities. Ver o cabecalho da 0064.';

comment on column public.activities.collaborator_id is
  'Colaborador responsavel pela atividade. Obrigatorio por check desde a 0064 (era NOT NULL); nulo apenas em linha importada cujo responsavel nao existe no export, e nesse caso a atividade nao aparece na tela Minhas Atividades de ninguem - so na visao gerencial.';
