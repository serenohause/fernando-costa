-- Modulo 9 (Mapa) - RLS das tres tabelas novas.
--
-- Matriz:
--   le:      qualquer colaborador active do escritorio, nas tres tabelas
--   escreve: can_edit_menu('map') nas tres
--
-- DE ONDE SAI A CHAVE DE MENU
--   Nao foi inventada. 'Mapa de Projetos' e item proprio da sidebar do original
--   (src/Layout.jsx:339), esta em docs/ENUM-MAP.md com o slug `map`, nasceu na
--   tabela menus na migration 0004 (linha 70, sort_order 80, sem parent) e ja e
--   concedida pelo seed da fundacao (supabase/seed/01-foundation.mjs:175).
--
--   UMA chave para as tres tabelas, ao contrario dos modulos 5, 7 e 8, que tem
--   duas cada: o mapa e uma tela so, e as duas filhas so existem de dentro do
--   formulario de propriedade. Consequencia para o teste: o par E1/E3 da suite de
--   padrao ja distingue 'map' de outro menu, entao este modulo NAO precisa da
--   secao 1 que budget-schema.sql e financial-schema.sql tiveram que escrever.
--
-- O QUE NAO MUDA AQUI
--   As oito colunas site_* que a 0057 acrescentou a projects nao ganham policy
--   nenhuma: RLS e por TABELA, e projects ja esta fechada desde a 0033, presa ao
--   menu 'projects'. Consequencia real e deliberada: quem tem 'map' e nao tem
--   'projects' cria e move pino do mapa a vontade e NAO escreve a geolocalizacao
--   do projeto. E o comportamento do original, onde as duas coisas sao duas telas
--   e a do mapa e explicitamente nao-intrusiva (MapaProjetos.jsx:537).
--
-- POR QUE A LEITURA E LARGA
--   Mesmo recorte dos modulos 2 a 5, 7 e 8. Quem nao deve abrir a tela ja e
--   barrado pelo menu ('map' com can_view), e duplicar esse recorte na policy
--   criaria um segundo lugar onde a mesma decisao pode divergir. A consequencia,
--   registrada como nos modulos anteriores: colaborador active com token valido
--   alcanca pela Data API o endereco e as coordenadas de todas as propriedades do
--   escritorio, inclusive as de clientes de quem ele nao cuida. E dado de
--   localizacao de pessoa fisica - a residencia do cliente. Se o escritorio
--   quiser apertar, o lugar e a policy de SELECT deste arquivo, e o caminho e
--   auth_collaborator_role(), que existe desde a 0007 exatamente para isso.
--
-- O ORIGINAL NAO CHECA NADA
--   MapaProjetos.jsx nao consulta PermissoesUsuario em lugar nenhum: quem abre a
--   rota cria, arrasta e remove pino. A permissao de menu la so esconde o item da
--   sidebar. Aqui ela vira autoridade.
--
-- Toda chamada de funcao vai dentro de (select ...) de proposito: assim o
-- planejador a trata como InitPlan e avalia UMA vez por comando, e nao uma vez
-- por linha.
--
-- Os dois lados da tranca, escritos a mao, como a 0007 deixou registrado: RLS sem
-- GRANT da "permission denied for table"; GRANT sem RLS entrega a tabela inteira
-- para a chave publicavel. anon NAO recebe nada - nenhuma tela deste modulo e
-- publica.
--
-- AS DUAS TABELAS-FILHAS TEM POLICY PROPRIA, e nao herdam nada pela FK. Postgres
-- nao propaga RLS por referencia: uma tabela filha sem policy simplesmente nao
-- responde (ou responde tudo, se alguem der GRANT sem ligar a RLS). O tenant_id
-- proprio existe pelo mesmo motivo - e o que a policy compara, e e o que a FK
-- composta amarra a mae.

-- map_properties -------------------------------------------------------------------

alter table public.map_properties enable row level security;

grant select, insert, update, delete on table public.map_properties to authenticated;

create policy map_properties_select_active_collaborator
  on public.map_properties
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy map_properties_select_active_collaborator on public.map_properties is
  'Leitura larga, como em clients (0017), contracts (0030), projects (0033), o financeiro (0042) e o modulo 8 (0050): qualquer colaborador active do escritorio ve os pinos. is_active_collaborator() mantem a regra transversal - colaborador em Ferias ou Afastado nao le nada. O que se le aqui e endereco e coordenada de residencia de cliente; a consequencia esta no cabecalho da 0058.';

create policy map_properties_insert_map_editor
  on public.map_properties
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('map'))
  );

comment on policy map_properties_insert_map_editor on public.map_properties is
  'Escrita presa ao menu map - e NAO a projects, que e o menu do outro lugar onde geolocalizacao mora. E o botao "+ Nova Propriedade no Mapa" (MapaProjetos.jsx:816), que no original nao checa permissao nenhuma. WITH CHECK amarra tenant_id ao claim do JWT: sem isso, quem edita o mapa do proprio escritorio criaria pino dentro do escritorio de outra pessoa mandando outro tenant_id no corpo do POST - escrita cruzada que a policy de SELECT nao pega porque SELECT nao roda no INSERT.';

create policy map_properties_update_map_editor
  on public.map_properties
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('map'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('map'))
  );

comment on policy map_properties_update_map_editor on public.map_properties is
  'USING escolhe quais linhas podem ser alteradas; WITH CHECK escolhe como elas podem ficar depois. Os dois sao obrigatorios: so com USING, quem edita o mapa pegaria um pino do proprio escritorio e reescreveria tenant_id para outro. E por aqui que passam as duas escritas da tela - arrastar o pino para ajustar a localizacao (MapaProjetos.jsx:391) e "Editar Informacoes" (:748).';

create policy map_properties_delete_map_editor
  on public.map_properties
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('map'))
  );

comment on policy map_properties_delete_map_editor on public.map_properties is
  '"Remover do Mapa" (MapaProjetos.jsx:1270), presa ao menu map. Leva as tags de terreno e finalidade junto, por cascade - elas sao parte do pino. NAO leva o projeto nem o cliente vinculados, que e o que o proprio dialogo do original promete ("O projeto vinculado continuara existindo normalmente", :1328).';

-- map_property_land_types -------------------------------------------------------------

alter table public.map_property_land_types enable row level security;

grant select, insert, update, delete on table public.map_property_land_types to authenticated;

create policy map_property_land_types_select_active_collaborator
  on public.map_property_land_types
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy map_property_land_types_select_active_collaborator on public.map_property_land_types is
  'Policy PROPRIA, e nao heranca da mae: Postgres nao propaga RLS por FK. Quem le o pino precisa ler as tags dele - e por elas que a tela decide se mostra o bloco de loteamento (MapaProjetos.jsx:1213). Mesmo recorte de map_properties.';

create policy map_property_land_types_insert_map_editor
  on public.map_property_land_types
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('map'))
  );

comment on policy map_property_land_types_insert_map_editor on public.map_property_land_types is
  'Mesmo menu da mae (map): tag so e criada de dentro do formulario de propriedade. O tenant_id conferido e o DESTA linha - a FK composta e que garante que ele bate com o da propriedade apontada.';

create policy map_property_land_types_update_map_editor
  on public.map_property_land_types
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('map'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('map'))
  );

comment on policy map_property_land_types_update_map_editor on public.map_property_land_types is
  'USING e WITH CHECK pelo mesmo motivo de map_properties. Na pratica o formulario do original alterna a tag em vez de edita-la (ProjectForm.jsx:262), mas policy que falta e policy que nega para sempre - e o A4 da suite de padrao cobra os quatro comandos.';

create policy map_property_land_types_delete_map_editor
  on public.map_property_land_types
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('map'))
  );

comment on policy map_property_land_types_delete_map_editor on public.map_property_land_types is
  'Remover uma tag de terreno do pino. Presa ao menu map. A remocao em cascata que vem de apagar a propriedade NAO passa por aqui - cascade roda como a operacao da mae, e quem a autoriza e a policy de DELETE de map_properties.';

-- map_property_purposes ---------------------------------------------------------------

alter table public.map_property_purposes enable row level security;

grant select, insert, update, delete on table public.map_property_purposes to authenticated;

create policy map_property_purposes_select_active_collaborator
  on public.map_property_purposes
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy map_property_purposes_select_active_collaborator on public.map_property_purposes is
  'Policy PROPRIA, e nao heranca da mae. Mesmo recorte de map_properties. E daqui que sai o filtro "Finalidade do Projeto" da tela (MapaProjetos.jsx:328-332): quem nao le a tag nao ve a opcao no dropdown nem o pino no recorte.';

create policy map_property_purposes_insert_map_editor
  on public.map_property_purposes
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('map'))
  );

comment on policy map_property_purposes_insert_map_editor on public.map_property_purposes is
  'Mesmo menu da mae (map). No original, acrescentar finalidade e um UPDATE do documento inteiro da propriedade (MapaProjetos.jsx:756) - aqui e INSERT nesta tabela, e a permissao conferida e a mesma.';

create policy map_property_purposes_update_map_editor
  on public.map_property_purposes
  for update
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('map'))
  )
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('map'))
  );

comment on policy map_property_purposes_update_map_editor on public.map_property_purposes is
  'USING e WITH CHECK pelo mesmo motivo das outras tabelas do modulo.';

create policy map_property_purposes_delete_map_editor
  on public.map_property_purposes
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('map'))
  );

comment on policy map_property_purposes_delete_map_editor on public.map_property_purposes is
  'Remover uma finalidade do pino, presa ao menu map. A cascata vinda da mae nao passa por aqui.';
