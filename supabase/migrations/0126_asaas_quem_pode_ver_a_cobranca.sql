-- As policies do Asaas: quem ve a cobranca, quem ve a conexao, e quem nao
-- escreve NADA.
--
-- O QUE A 0125 DEIXOU EM ABERTO
--   A 0125 criou as quatro tabelas, ligou a RLS e disse em voz alta que as
--   policies eram a etapa seguinte. O estado medido hoje confirma: RLS ligada,
--   ZERO policy e NENHUM grant para anon ou authenticated nas quatro. Ou seja,
--   a tela nao recebe lista vazia, recebe "permission denied for table" - a
--   tabela esta fail-closed pelas DUAS barreiras ao mesmo tempo (achado da
--   0007: GRANT e RLS sao separadas, e nenhuma substitui a outra).
--
--   Esta migration abre UM recorte de LEITURA em tres das quatro tabelas, e
--   nada alem dele. Depois dela, authenticated continua sem caminho de escrita
--   em todas as quatro.
--
-- A DECISAO MAIS IMPORTANTE DESTE ARQUIVO: LEITURA PARA QUEM VE O
-- FINANCEIRO, ESCRITA PARA NINGUEM
--
--   asaas_charges e asaas_customers nao tem policy nem grant de INSERT, UPDATE
--   ou DELETE para authenticated, e a ausencia e o desenho do modulo.
--
--   A VERDADE DESSAS DUAS TABELAS E DO ASAAS. Elas sao ESPELHO do que o
--   provedor diz: o status da cobranca, o valor liquido, a data em que o
--   cliente pagou, o cus_ que identifica o cliente la. Quem escreve e a Edge
--   Function falando como service_role, a partir da resposta da API e do aviso
--   do webhook - e service_role passa por cima de RLS por desenho, entao
--   nenhuma policy daqui precisa (nem deve) autorizar essa escrita.
--
--   TELA QUE PUDESSE EDITAR `status` DE COBRANCA SERIA TELA QUE MENTE SOBRE
--   PAGAMENTO. Com UPDATE ao alcance de authenticated, qualquer colaborador com
--   token valido poderia escrever status = 'RECEIVED' numa cobranca sem que um
--   centavo tivesse entrado na conta do escritorio, ou virar `deleted` para
--   true e liberar a parcela para uma segunda cobranca do mesmo valor. Nos dois
--   casos o banco passaria a afirmar um fato financeiro que o Asaas nunca
--   confirmou, e a conciliacao com o extrato - que e a unica forma de descobrir
--   a mentira - acontece dias depois, se acontecer.
--
--   Esta e tambem a razao pela qual a parcela so vira paga pelo AVISO do Asaas,
--   e nunca pelo clique de alguem (cabecalho da 0125). Abrir escrita no espelho
--   seria devolver pela porta lateral exatamente o gesto que a fase 1 recusou
--   na porta da frente.
--
-- POR QUE A LEITURA PEDE O MENU, E NAO SO O ESCRITORIO
--   Padrao do sistema em tabela de negocio e leitura larga: colaborador active
--   do escritorio le (clients 0017, contracts 0030, accounts_receivable 0042 e
--   0047). Aqui a leitura e mais estreita, por decisao do usuario: quem ve a
--   cobranca e quem ve o menu `receivables`.
--
--   ISSO PRODUZ UMA ASSIMETRIA, E ELA E DELIBERADA: um colaborador active sem o
--   menu `receivables` continua lendo a PARCELA (accounts_receivable tem
--   leitura larga, e a 0047 registra isso com todas as letras, inclusive que o
--   menu apenas esconde o item da barra lateral), mas NAO le a cobranca do
--   Asaas daquela parcela. Nao e lacuna de uma policy contra a outra: a linha
--   de cobranca carrega link de pagamento, copia e cola de PIX, valor liquido e
--   numero do boleto - superficie de cobranca do escritorio, e nao a carteira
--   que o sistema inteiro ja mostra. Se um dia a leitura do financeiro inteiro
--   for apertada, o lugar continua sendo a policy da 0047; esta aqui nao
--   depende daquela decisao.
--
-- (select ...) EM VOLTA DAS FUNCOES
--   Idioma do projeto desde a 0007: embrulhada em subconsulta, a funcao stable
--   vira InitPlan e e avaliada UMA vez por consulta, e nao uma vez por linha.
--   can_view_menu faz acesso a collaborator_permissions por PK; sem o
--   embrulho, isso aconteceria por cobranca lida.
--
-- A COMPARACAO DE TENANT VEM DO CLAIM, e nao de tabela de relacao
--   tenant_id = (select public.auth_tenant_id()), que le
--   app_metadata.tenant_id do JWT (0006). Nenhuma policy deste arquivo consulta
--   tenant_users nem recebe tenant_id do corpo da requisicao - regra de
--   multitenancy do CLAUDE.md, e o que impede N+1 dentro da propria RLS.

-- 1. A cobranca e o espelho do cliente: leitura para quem ve o financeiro ------
--
-- As duas tabelas andam juntas de proposito: o espelho (cus_) e o que liga a
-- cobranca ao cliente, e abrir uma sem a outra deixaria a tela do financeiro
-- com cobranca sem nome ou com nome sem cobranca.
--
-- revoke antes do grant: redundante desde que a 0007 desarmou o DEFAULT
-- PRIVILEGE, e fica escrito porque redundancia barata em barreira de acesso e
-- barata.

revoke all on table public.asaas_charges from anon, authenticated;
revoke all on table public.asaas_customers from anon, authenticated;

grant select on table public.asaas_charges to authenticated;
grant select on table public.asaas_customers to authenticated;

create policy asaas_charges_select_receivables_viewer
  on public.asaas_charges for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_view_menu('receivables'))
  );

comment on policy asaas_charges_select_receivables_viewer on public.asaas_charges is
  'DECIDE: quem ve o menu receivables le as cobrancas do Asaas do escritorio do claim do JWT. Diretor active entra pelo atalho que can_view_menu ja tem (0059); colaborador em Ferias ou Afastado nao entra, porque auth_collaborator_id devolve null dentro da funcao. NAO DECIDE ESCRITA, e essa ausencia e o desenho: nao existe policy nem grant de INSERT, UPDATE ou DELETE para authenticated nesta tabela. A linha e ESPELHO do que o Asaas diz, e quem a escreve e a Edge Function como service_role. Tela que pudesse editar status seria tela que mente sobre pagamento - daria para marcar cobranca como RECEIVED sem um centavo ter entrado, ou virar deleted e liberar a parcela para uma segunda cobranca do mesmo valor. Nao "complete" esta tabela com policy de escrita.';

create policy asaas_customers_select_receivables_viewer
  on public.asaas_customers for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_view_menu('receivables'))
  );

comment on policy asaas_customers_select_receivables_viewer on public.asaas_customers is
  'DECIDE: quem ve o menu receivables le o espelho de cliente (cus_) do escritorio do claim do JWT. Mesmo recorte da cobranca, e as duas andam juntas porque e o espelho que liga a cobranca ao cliente. NAO DECIDE ESCRITA: sem policy e sem grant de INSERT, UPDATE ou DELETE para authenticated. Quem cria e reconcilia o espelho e a Edge Function como service_role, a partir da resposta da API do Asaas - a unicidade desta tabela existe justamente para o mesmo cliente nao ganhar dois cus_, e escrita pela tela seria o caminho mais curto para produzir o segundo.';

comment on table public.asaas_charges is
  'Liga uma parcela de accounts_receivable a uma cobranca (`payment`) do Asaas. Espelho do que o provedor diz, nao fonte: quem decide se a parcela esta paga continua sendo accounts_receivable, atualizada a partir do aviso do Asaas. Uma cobranca ATIVA por parcela, garantida pelo indice unico parcial asaas_charges_one_active_per_receivable_idx. RLS (0126): leitura por can_view_menu(''receivables'') no tenant do JWT; NENHUMA escrita para authenticated, nem policy nem grant - quem escreve e a Edge Function como service_role, porque tela que editasse status ou deleted poderia afirmar pagamento que nao houve.';

comment on table public.asaas_customers is
  'Liga public.clients ao `customer` do Asaas (cus_...). Existe porque a API do Asaas ACEITA criar cliente duplicado - esta na doc dela - e sem unicidade do nosso lado o mesmo cliente ganharia dois cus_, cada um com parte do historico. O documento (cpfCnpj) exigido na criacao vem de clients.tax_id_digits; cliente sem documento nao pode ser espelhado, e essa recusa e de quem chama a API, nao desta tabela (nenhuma coluna nova foi criada em clients para isso). RLS (0126): leitura por can_view_menu(''receivables'') no tenant do JWT; NENHUMA escrita para authenticated - o espelho e criado e reconciliado pela Edge Function como service_role.';

-- 2. A conexao do escritorio: no molde do Google Agenda -----------------------
--
-- Mesma forma da 0085: leitura do ESTADO da conexao (ligada ou nao, qual
-- ambiente, quando funcionou pela ultima vez, qual foi o ultimo erro) para quem
-- ve `settings`, no tenant do JWT. E a tela de Configuracoes que consome isso,
-- e sem o ultimo erro "a cobranca nao foi emitida" nao tem por onde comecar -
-- chave vencida e chave de sandbox em producao tem o mesmo sintoma (nada
-- acontece).
--
-- O GRANT E DE TABELA, PONTEIRO DO VAULT INCLUIDO, e isso e consistencia com a
-- 0085 e nao descuido. La o grant tambem e de tabela e alcanca
-- refresh_token_secret_id. O que a coluna guarda e um uuid que so serve DENTRO
-- do Vault, e o Vault nao esta ao alcance de authenticated: as funcoes que
-- decifram segredo sao security definer com EXECUTE apenas para service_role, e
-- o schema vault nao e exposto pela Data API. Ler o ponteiro nao decifra nada -
-- vazar essa coluna nao vaza nada, vazar a chave vaza o caixa (comentario da
-- propria coluna, 0125).
--
-- ESCRITA: NENHUMA. Ligar e desligar a conta Asaas vai acontecer por funcao
-- security definer, na camada seguinte, igual ao google_calendar_connect e ao
-- google_calendar_disconnect da 0085 - toda escrita aqui envolve criar, trocar
-- ou apagar segredo no Vault, e isso nao cabe numa policy. Aquelas funcoes NAO
-- estao neste arquivo de proposito: elas sao desenhadas junto da Edge Function.
-- O que este arquivo garante e que nao fica caminho de escrita aberto no
-- meio-tempo: sem grant de UPDATE nem policy de UPDATE, nem a escolha de
-- ambiente nem o ponteiro do segredo sao gravaveis pela tela.
--
--   (Na 0085 existe UM update pela tela - a escolha da agenda lida - e ele e
--   recortado por GRANT DE COLUNA. Aqui nao existe campo equivalente: nao ha
--   nada na conexao do Asaas que a tela escolha sem falar com o provedor.)

revoke all on table public.asaas_connections from anon, authenticated;

grant select on table public.asaas_connections to authenticated;

create policy asaas_connections_select_settings_viewer
  on public.asaas_connections for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_view_menu('settings'))
  );

comment on policy asaas_connections_select_settings_viewer on public.asaas_connections is
  'DECIDE: quem enxerga Configuracoes le o ESTADO da conexao Asaas do proprio escritorio - ligada ou nao, qual ambiente, ultimo sucesso, ultimo erro. Molde da policy irma de google_calendar_connections (0085): nao e leitura larga como no resto do sistema, porque a linha e infraestrutura de cobranca e interessa a quem configura, nao ao escritorio inteiro. O menu e `settings`, e NAO `receivables`: a tela que liga a conta e Configuracoes. As colunas api_key_secret_id e webhook_token_secret_id ficam dentro do grant de tabela, como na 0085, porque sao PONTEIRO para o Vault - uuid que nao decifra nada fora dele, e o Vault so e alcancavel por funcoes security definer com EXECUTE para service_role. NAO DECIDE ESCRITA: sem policy e sem grant de INSERT, UPDATE ou DELETE. Ligar e desligar sao funcoes security definer da camada seguinte, como google_calendar_connect e google_calendar_disconnect, porque toda escrita aqui cria, troca ou apaga segredo no Vault.';

comment on table public.asaas_connections is
  'A conta Asaas que o escritorio ligou para cobrar os clientes dele. Guarda METADADO: a API Key e o token do webhook vivem no Vault e as colunas *_secret_id so apontam para eles. Uma conexao por escritorio, porque cada escritorio recebe no caixa proprio. RLS (0126): leitura do estado por can_view_menu(''settings'') no tenant do JWT, no molde de google_calendar_connections (0085); NENHUMA escrita para authenticated - conectar e desconectar sao funcoes security definer chamadas como service_role, porque tocam o Vault.';

-- 3. O diario dos avisos: NADA para authenticated, e isso e decisao -----------
--
-- LEIA ANTES DE "COMPLETAR" ESTE ARQUIVO: asaas_webhook_events fica SEM POLICY
-- E SEM GRANT, de proposito. A ausencia nao e esquecimento, e nao falta nada
-- aqui.
--
-- POR QUE
--   A tabela nao e dado de escritorio: e TRAFEGO DE PROVEDOR e FILA DE
--   PROCESSAMENTO. Cada linha e o corpo cru de um aviso HTTP do Asaas, guardado
--   inteiro como prova do que ele disse, mais o estado do processamento
--   (received_at, processed_at, processing_error, processing_attempts). Quem le
--   isso e a Edge Function, como service_role, e quem escreve e ela tambem.
--   Nenhuma tela do escritorio consome esta tabela.
--
--   Tres consequencias concretas de abrir leitura aqui, e e por elas que ela
--   fica fechada:
--     - o payload traz o corpo do provedor sem recorte, e o que ele contem
--       amanha nao e decisao nossa (a doc avisa que atributos novos aparecem
--       sem aviso previo). Policy de leitura sobre payload cru e promessa sobre
--       um dado cujo formato outra empresa controla.
--     - a linha chega ANTES de sabermos de quem ela e. O tenant sai do
--       authToken do webhook, e a propria 0125 registra que a resolucao pode
--       errar o escritorio - a deduplicacao e global exatamente por isso.
--       Tabela legivel por tenant, com linha cuja atribuicao de tenant e o
--       passo que pode falhar, e a combinacao errada.
--     - idempotencia e estado de fila sao mecanismo interno. Nada do que o
--       escritorio precisa saber sobre dinheiro mora aqui: mora na cobranca
--       (asaas_charges) e na parcela (accounts_receivable), que a secao 1 abriu.
--
-- O QUE FAZER QUANDO ALGUEM PRECISAR SABER POR QUE UM AVISO NAO PROCESSOU
--   Nao abrir esta tabela. O caminho e um resumo: funcao security definer que
--   devolve contagem e ultimo erro, conferindo can_view_menu('settings') por
--   dentro, ou a coluna last_error da conexao, que a secao 2 ja torna legivel.
--   Os dois mostram o diagnostico sem expor o corpo do provedor nem a fila.
--   Isso esta sinalizado ao usuario e NAO foi decidido aqui.
--
-- O revoke abaixo nao muda estado nenhum hoje (a 0125 nao concedeu nada). Ele
-- esta escrito para a ausencia ser AFIRMATIVA no arquivo, e nao apenas um
-- paragrafo sem comando ao lado.

revoke all on table public.asaas_webhook_events from anon, authenticated;

comment on table public.asaas_webhook_events is
  'Diario dos avisos do Asaas, gravado antes de qualquer efeito. E a tabela que impede pagamento contado duas vezes: a entrega e at least once (a doc diz que o mesmo evento pode chegar mais de uma vez e manda deduplicar pelo id), e o unique em asaas_event_id e o que faz a reentrega falhar na gravacao em vez de baixar a parcela de novo. Grava-se e responde-se 200; o processamento vem depois e carimba processed_at ou processing_error. RLS (0126): NENHUMA policy e NENHUM grant para authenticated ou anon, e a ausencia e DECISAO, nao esquecimento - e trafego de provedor e fila de processamento, nao dado de escritorio, e quem le e escreve e a Edge Function como service_role. Quem precisar saber por que um aviso nao processou recebe um RESUMO por funcao security definer, nunca leitura do payload cru: ele e corpo de terceiro, chega antes de sabermos de qual escritorio e, e nada que o escritorio precise saber sobre dinheiro mora aqui.';

-- 4. O que NAO esta aqui, nas quatro ------------------------------------------
--
-- SEM POLICY E SEM GRANT DE INSERT, UPDATE E DELETE para authenticated, nas
-- QUATRO tabelas. As duas barreiras ausentes ao mesmo tempo, e isso tambem e de
-- proposito: com grant e sem policy a recusa viria da RLS; sem grant, ela vem
-- antes, do privilegio. Quem um dia precisar de escrita pela tela vai ter que
-- conceder as duas coisas, de proposito, e vai tropecar neste comentario antes.
--
-- SEM POLICY PARA anon. Nenhuma tela publica deste modulo existe. O webhook
-- chega por Edge Function, que fala como service_role - ele nao passa pela Data
-- API, e por isso nao precisa (nem deve) de superficie anon.
--
-- E O service_role SEGUE POR CIMA DE TUDO, por desenho: e o bypass server-side
-- (Edge Functions, reconciliacao, processamento da fila), a chave dele nunca sai
-- do servidor e nenhuma das tres policies acima se aplica a ele - as tres sao
-- `to authenticated`. As quatro tabelas tambem NAO usam FORCE ROW LEVEL
-- SECURITY, e nao podem passar a usar sem que as funcoes security definer da
-- camada seguinte parem de gravar (mesma dependencia registrada na 0121).
--
-- O teste de isolamento desta migration e supabase/tests/asaas-rls.sql, rodado
-- por `npm run test:rls:asaas`. Ele prova as negativas E os controles
-- positivos, inclusive que service_role continua trabalhando nas quatro -
-- negativa sem controle positivo passaria com nota cheia num modulo que nao
-- funciona.
