-- Perfil do usuario: dados pessoais, foto e troca de senha.
--
-- O CASO
--   Ate aqui o colaborador nao tinha NADA seu para editar. Nome, area e funcao
--   sao mantidos pelo Diretor na tela de Equipe, o que esta certo para funcao e
--   area — mas nao para o proprio nome, o telefone e a foto, que sao dados da
--   pessoa e nao decisoes do escritorio.
--
-- POR QUE UMA FUNCAO, E NAO UMA POLICY DE "EDITAR A PROPRIA LINHA"
--   RLS decide QUAIS LINHAS, nunca QUAIS COLUNAS. Uma policy de UPDATE sobre a
--   propria linha de `collaborators` deixaria o colaborador reescrever `role` e
--   virar Diretor, ou `status` e reativar a si mesmo depois de afastado — pela
--   API, sem passar por tela nenhuma.
--
--   Grant de coluna tambem nao resolveria aqui: a 0009 ja concedeu
--   `update` na TABELA INTEIRA para authenticated (o que e correto para o
--   Diretor, que a policy filtra), e um grant de coluna nao subtrai o que ja
--   foi concedido.
--
--   Sobra a funcao: ela nomeia as tres colunas que podem mudar, e a lista e
--   auditavel lendo o corpo dela.
--
-- A SENHA NAO PASSA POR AQUI. Quem troca senha e o GoTrue
-- (`supabase.auth.updateUser`), e a senha nunca chega ao Postgres nem a este
-- schema. A tela pede a senha ATUAL antes, e confere reautenticando — sem isso,
-- um computador deixado aberto vira uma conta tomada.

-- 1. As colunas -----------------------------------------------------------------

alter table public.collaborators
  add column phone text,
  add column avatar_path text;

-- Mesmo teto e mesma tolerancia de `clients.phone`: o telefone e guardado como
-- a pessoa digitou, com pontuacao, porque e o que a tela exibe.
alter table public.collaborators
  add constraint collaborators_phone_length_check
    check (phone is null or length(phone) <= 30);

-- O caminho no bucket, e nao uma URL: bucket privado nao serve URL publica, e
-- guardar uma que nao funciona seria guardar mentira. A tela pede uma URL
-- assinada na hora de exibir.
alter table public.collaborators
  add constraint collaborators_avatar_path_format_check
    check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$');

comment on column public.collaborators.phone is
  'Telefone do colaborador, guardado como digitado. Editavel pelo proprio, em Perfil (0088), e pelo Diretor na tela de Equipe.';
comment on column public.collaborators.avatar_path is
  'Caminho do objeto no bucket `avatars`: <tenant_id>/<collaborator_id>/<uuid>.<ext>. NAO e uma URL - o bucket e privado e a tela assina o acesso na hora de exibir. O check garante o formato, que e o mesmo que as policies de storage conferem segmento a segmento.';

-- 2. A escrita do proprio perfil -------------------------------------------------

create or replace function public.update_own_profile(
  p_name text,
  p_phone text default null,
  p_avatar_path text default null
)
returns public.collaborators
language plpgsql
security definer
set search_path = ''
as $BODY$
declare
  v_collaborator_id uuid;
  v_row public.collaborators%rowtype;
begin
  /*
    `auth_collaborator_id()` ja exige colaborador ACTIVE do tenant do JWT. Quem
    esta em Ferias ou Afastado nao edita o proprio cadastro — e nao por
    mesquinharia: a linha de quem esta afastado e justamente a que o escritorio
    pode estar usando para decidir alguma coisa.
  */
  v_collaborator_id := public.auth_collaborator_id();
  if v_collaborator_id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'nome obrigatorio' using errcode = '22023';
  end if;

  /*
    TRES COLUNAS, NOMEADAS. `role`, `status`, `area`, `email`, `tenant_id`,
    `coordinator_id` e `weekly_hours` NAO estao aqui, e a ausencia e o ponto
    inteiro desta funcao: sao decisoes do escritorio sobre a pessoa, nao dados
    da pessoa sobre si.

    `p_avatar_path` nulo LIMPA a foto, e e assim que o botao "Remover foto"
    funciona. Quem so quer trocar o nome manda o caminho atual de volta.
  */
  /*
    O CAMINHO DA FOTO TEM DE SER O DA PROPRIA PASTA.

    O check da coluna confere o FORMATO; as policies do Storage impedem gravar
    ou apagar objeto na pasta de outra pessoa. Nenhum dos dois impede o que
    sobra: apontar o proprio cadastro para o objeto de um COLEGA do mesmo
    escritorio e passar a exibir a foto dele. Nao e vazamento (a foto ja e
    visivel para o escritorio), e sim identidade trocada na tela — que num
    sistema com foto ao lado do nome e o suficiente para confundir quem le.
  */
  if p_avatar_path is not null and (
       split_part(p_avatar_path, '/', 1) <> (select public.auth_tenant_id())::text
       or split_part(p_avatar_path, '/', 2) <> v_collaborator_id::text
     ) then
    raise exception 'caminho de foto fora da propria pasta' using errcode = '42501';
  end if;

  update public.collaborators c
  set name = btrim(p_name),
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      avatar_path = p_avatar_path
  where c.id = v_collaborator_id
  returning * into v_row;

  return v_row;
end;
$BODY$;

comment on function public.update_own_profile(text, text, text) is
  'Deixa o colaborador editar o PROPRIO nome, telefone e foto - e so isso. O caminho da foto tem de estar dentro da propria pasta (<tenant>/<colaborador>/), senao daria para apontar o proprio cadastro para o objeto de um colega e exibir a foto dele. Existe porque RLS decide quais linhas e nunca quais colunas: uma policy de "editar a propria linha" em collaborators deixaria qualquer um reescrever `role` e virar Diretor. As colunas editaveis estao nomeadas no corpo, e a lista e auditavel lendo a funcao.';

revoke all on function public.update_own_profile(text, text, text) from public, anon;
grant execute on function public.update_own_profile(text, text, text) to authenticated;

-- 3. O bucket das fotos ----------------------------------------------------------
--
--    PRIVADO, como `budget-files` (0052) e `project-diary-files` (0071). Foto de
--    perfil nao e segredo de estado, mas bucket publico e um endereco que
--    responde para a internet inteira sem sessao — e a foto vem acompanhada do
--    nome do arquivo, que aqui carrega tenant e colaborador.
--
--    2 MB e o suficiente para um retrato; acima disso e foto de camera enviada
--    sem querer, que o bucket recusa antes de ocupar banda.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- O caminho e <tenant_id>/<collaborator_id>/<uuid>.<ext>, e os DOIS primeiros
-- segmentos sao conferidos: o primeiro contra o escritorio do JWT, o segundo
-- contra o colaborador. Escrever so na propria pasta e o que impede alguem de
-- trocar a foto de um colega — que, num sistema com foto ao lado do nome, e
-- mais do que uma travessura.

create policy avatars_select_active_collaborator
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.is_active_collaborator())
  );

comment on policy avatars_select_active_collaborator on storage.objects is
  'Leitura das fotos de perfil do proprio escritorio - a foto aparece ao lado do nome em varias telas, entao qualquer colaborador active le a de todos. O recorte por escritorio esta no primeiro segmento do caminho.';

create policy avatars_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (storage.foldername(name))[2] = (select public.auth_collaborator_id())::text
  );

comment on policy avatars_insert_own on storage.objects is
  'Cada um envia a foto DENTRO da propria pasta: o segundo segmento do caminho tem de ser o proprio collaborator_id. Sem essa comparacao, um colaborador poderia gravar dentro da pasta de um colega e trocar a foto dele.';

create policy avatars_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (storage.foldername(name))[2] = (select public.auth_collaborator_id())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (storage.foldername(name))[2] = (select public.auth_collaborator_id())::text
  );

comment on policy avatars_update_own on storage.objects is
  'USING e WITH CHECK pelo mesmo motivo do modulo 8: sem WITH CHECK, um objeto da propria pasta poderia ser RENOMEADO para dentro da pasta de outra pessoa, que e como se move arquivo no Storage.';

create policy avatars_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (storage.foldername(name))[2] = (select public.auth_collaborator_id())::text
  );

comment on policy avatars_delete_own on storage.objects is
  'Apagar a propria foto. Quem troca a foto apaga a anterior pela tela; sem isto o bucket acumularia todas as versoes que cada pessoa ja teve.';
