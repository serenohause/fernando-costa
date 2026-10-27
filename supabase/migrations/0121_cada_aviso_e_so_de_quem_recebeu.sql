-- As policies do sino: cada aviso e so de quem recebeu.
--
-- O QUE A 0120 DEIXOU EM ABERTO
--   A 0120 ligou a RLS, escreveu os GRANT e disse em voz alta que as policies
--   eram a etapa seguinte. O estado medido hoje confirma: notifications tem RLS
--   ligada e ZERO policy, ou seja, esta fail-closed - a Data API nao devolve
--   linha alguma para quem esta logado, nem a propria. O sino nao acende.
--   Esta migration abre o recorte, e nada alem dele.
--
-- O RECORTE E A PESSOA, E NAO O ESCRITORIO
--   Esta e a diferenca que importa, e ela vai contra o habito do resto do
--   sistema: em quase toda tabela de negocio o leitor e "colaborador active do
--   escritorio", e o Diretor tem atalho (is_tenant_manager, can_edit_menu).
--   AQUI NAO HA ATALHO DE DIRETOR. O aviso e um fato sobre UMA pessoa - "voce
--   foi avisado" -, carrega o nome de quem atribuiu e o estado de leitura dela.
--   Diretor que lesse o sino da equipe saberia quem ainda nao abriu o que, e
--   isso nao e dado de escritorio, e vigilancia. Quem quiser saber o que a
--   equipe tem para fazer le o Fluxo do Projeto, que e a tela desse assunto.
--
-- DUAS CONDICOES, E NAO UMA
--   public.auth_collaborator_id() JA embute o tenant do JWT e o status active
--   (0007), logo recipient_id = auth_collaborator_id() sozinho bastaria hoje. A
--   comparacao de tenant_id fica, por dois motivos distintos:
--     1. PLANO: o indice de leitura do painel e
--        (tenant_id, recipient_id, created_at desc), e ele comeca por tenant_id.
--        Sem predicado nessa coluna o planejador nao tem como usar o indice pela
--        frente.
--     2. BARREIRA: no dia em que auth_collaborator_id() mudar de criterio - e
--        funcao usada por meio sistema -, a policy nao passa a vazar entre
--        escritorios em silencio. Redundancia barata em barreira de acesso e
--        barata.
--
-- O QUE A POLICY NAO DECIDE, e e de proposito
--   - STATUS: quem esta em Ferias ou Afastado nao le o proprio aviso, e a regra
--     nao esta escrita aqui - vem de dentro de auth_collaborator_id(), que
--     devolve null fora de active. Null nunca casa em igualdade, entao a linha
--     simplesmente nao aparece. Mesmo comportamento transversal das outras
--     tabelas, herdado e nao reescrito.
--   - MENU: nao ha can_view('notificacoes'). O sino nao e item de menu, e
--     permissao de menu aqui poderia tirar da pessoa o aviso de uma tarefa que
--     ela tem que fazer.
--   - QUEM ESCREVE: nada abaixo autoriza escrita de aviso. Ver o item 3.
--
-- (select ...) EM VOLTA DAS FUNCOES
--   Idioma do projeto desde a 0007: embrulhada em subconsulta, a funcao stable
--   vira InitPlan e e avaliada UMA vez por consulta, nao uma vez por linha. Em
--   tabela que cresce para sempre - e notifications nunca apaga linha - a
--   diferenca e entre uma chamada e dez mil.

-- 1. Ler: so os avisos da propria pessoa -------------------------------------

create policy notifications_select_own_recipient
  on public.notifications for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and recipient_id = (select public.auth_collaborator_id())
  );

comment on policy notifications_select_own_recipient on public.notifications is
  'DECIDE: quem esta logado le apenas os avisos em que ele mesmo e o destinatario, no escritorio do claim do JWT. recipient_id vem da LINHA e auth_collaborator_id() vem do JWT - nenhum dos dois vem do corpo da requisicao, entao nao ha id de destinatario para o cliente forjar. NAO DECIDE: nada por funcao de negocio - Diretor NAO le o sino da equipe, e esta e a tabela em que o atalho de Diretor deliberadamente nao existe. NAO DECIDE status (vem de dentro de auth_collaborator_id, que devolve null fora de active) nem permissao de menu (o sino nao e item de menu). NAO DECIDE escrita: nao ha policy de INSERT nem de DELETE nesta tabela.';

-- 2. Escrever: so marcar o proprio aviso como lido ---------------------------
--
-- A MESMA CONDICAO NO using E NO with check, e a repeticao e o ponto.
--   O `using` responde "esta linha e sua?" e decide QUAIS linhas o UPDATE
--   alcanca. O `with check` responde "e ela continua sua depois?" e decide QUAL
--   LINHA PODE FICAR GRAVADA. O ataque que separa os dois e um UPDATE que, no
--   mesmo comando, poe read_at e troca recipient_id: ele passa pelo `using` (a
--   linha era sua) e, se nada olhasse a linha de saida, gravaria um aviso no
--   sino de outra pessoa - ou tiraria do sino dela o que era dela.
--
--   O QUE A CLAUSULA ESCRITA ACRESCENTA, MEDIDO E NAO SUPOSTO. Duas coisas ja
--   recusam esse comando hoje, e nenhuma das duas e o texto abaixo:
--     1. o GRANT de coluna da 0120 (update apenas de read_at) recusa antes de a
--        policy opinar - barreira separada, e e o achado da 0007;
--     2. o PROPRIO POSTGRES, que em policy de UPDATE sem `with check` reaproveita
--        o `using` como check da linha de saida. Omitir a clausula nao abriria o
--        caminho de mover o aviso enquanto o `using` continuasse estreito, e
--        afirmar o contrario seria errado.
--
--   ELA FICA ESCRITA porque o que esse reaproveitamento faz e AMARRAR as duas
--   perguntas numa so. No dia em que o `using` alargar - e o pedido plausivel
--   existe: "o Diretor marca como lido pela equipe" -, o check alargaria junto,
--   calado, e marcar como lido pelo outro passaria a incluir mover o aviso para
--   um terceiro. Escrita, a condicao de saida nao se mexe quando a de entrada
--   mexer. O teste de isolamento prova exatamente isso: ele alarga o `using`
--   dentro da transacao e mostra que o aviso continua sem poder trocar de dono.

create policy notifications_update_own_recipient
  on public.notifications for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and recipient_id = (select public.auth_collaborator_id())
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and recipient_id = (select public.auth_collaborator_id())
  );

comment on policy notifications_update_own_recipient on public.notifications is
  'DECIDE: quem esta logado atualiza apenas os proprios avisos (using), e a linha gravada continua tendo que ser dele, no mesmo escritorio (with check) - ou seja, marcar como lido nao e caminho para mover o aviso para o sino de outra pessoa. O with check esta escrito e nao implicito de proposito: Postgres reaproveitaria o using como check de saida, amarrando as duas perguntas, e no dia em que o using alargar (o pedido plausivel e "o Diretor marca como lido pela equipe") a condicao de saida nao deve alargar junto. NAO DECIDE QUAIS COLUNAS podem mudar: isso e o GRANT de coluna da 0120 (update apenas de read_at), barreira separada desta - a policy escolhe a LINHA, o privilegio escolhe a COLUNA, e nenhuma das duas substitui a outra. NAO DECIDE desfazer leitura: read_at voltar a nulo e aceito de proposito, porque e o proprio aviso da propria pessoa.';

-- 3. O que NAO esta aqui -----------------------------------------------------
--
-- SEM POLICY DE INSERT E SEM POLICY DE DELETE, e sem GRANT para elas (a 0120 ja
-- nao concedeu nenhum dos dois, e esta migration nao concede).
--
--   INSERT: aviso NASCE de gatilho (public.notify_task_assigned) e de funcao de
--   varredura (public.scan_overdue_tasks), as duas SECURITY DEFINER e nenhuma
--   das duas ao alcance de authenticated. Aviso que a tela pudesse inserir seria
--   aviso falsificavel: o painel mostra "Ana te atribuiu", e quem insere escolhe
--   o nome que quiser. Pela mesma razao nao existe RPC de inserir aviso.
--
--   DELETE: ninguem apaga o proprio historico. "Voce foi avisado" e exatamente o
--   que o aviso prova, e aviso apagavel apaga a prova. Lida nao sai da lista - e
--   a decisao 2 do usuario sobre o prototipo, e o painel mostra lidas e nao
--   lidas juntas.
--
-- Os dois escritores continuam funcionando com a RLS ligada porque sao DEFINER
-- de um dono (postgres) que nao sofre row security, e notifications NAO usa
-- FORCE ROW LEVEL SECURITY. Mesma dependencia de record_task_event (0104) e dos
-- helpers da 0007: a tabela nao pode passar a usar FORCE sem que o gatilho e a
-- varredura parem de gravar.
--
-- E O service_role segue por cima de tudo, por desenho: e o bypass server-side
-- (Edge Functions, agendamento), a chave dele nunca sai do servidor e nenhuma
-- das duas policies acima se aplica a ele - elas sao `to authenticated`.
