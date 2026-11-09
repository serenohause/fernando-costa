-- Modulo 9 (Mapa) - as fotos de uma propriedade: a tabela, o bucket e as oito
-- policies.
--
-- O QUE ISTO ACRESCENTA, E O QUE JA EXISTIA
--   O balao do pino (PropertyPopup.tsx) mostra nome, cliente, status, endereco e
--   quatro botoes. Nao mostra a propriedade. Esta migration cria o lugar onde a
--   foto do terreno e da obra passa a morar - uma linha por foto, como as duas
--   outras filhas do modulo (0057), e nao um array de URL dentro de
--   map_properties.
--
--   NAO E MIGRACAO DE NADA: o base44 nao tem foto em PropriedadeMapa, e
--   projeto-original/ nao tem tela para isto. E feature nova, pedida pelo
--   escritorio. Por isso nao ha "fidelidade ao original" a cobrar aqui, e por
--   isso o desenho segue o que este projeto ja decidiu para arquivo (modulos 8 e
--   11) em vez de inventar forma propria.
--
-- POR QUE UM BUCKET NOVO, E NAO O project-diary-files DA 0071
--   Pela mesma razao que fez a 0071 nao reusar o budget-files da 0052, e e razao
--   de CONTROLE, nao de arrumacao: a chave de permissao e outra. As quatro
--   policies do bucket do diario sao gatilhadas por is_project_diary_writer()
--   (hoje can_edit_menu('project_flow'), depois da 0123); aqui a escrita e
--   can_edit_menu('map'). Somar uma quinta policy com outra regra ao mesmo
--   bucket faria dois modulos dividirem a mesma superficie, e mudanca de um
--   passaria a mexer no outro sem que nada acusasse.
--
--   A FORMA e copiada da 0071, porque ela ja esta certa: bucket privado, limite
--   no servidor e nao no navegador, caminho comecando pelo tenant_id, nome de
--   objeto em uuid, policies comparando storage.foldername(name)[1] com o claim,
--   anon sem nada.
--
-- SO IMAGEM, E TRES FORMATOS
--   O bucket do diario aceita cinco tipos porque o diario anexa PDF e texto.
--   Aqui o campo e carrossel de foto: jpeg, png e webp, que e o que celular e
--   navegador produzem. Fora da lista ficam HEIC e TIFF (o Chrome nao desenha),
--   GIF (ninguem pediu) e SVG, que e superficie de script servida do mesmo
--   dominio assinado. Formato novo entra por migration, nao por excecao no
--   codigo do upload.
--
-- O QUE ESTE DESENHO NAO RESOLVE, e fica registrado como nas 0052 e 0071
--   Storage nao tem FK. Apagar o pino leva a linha desta tabela por cascade e
--   NAO apaga o objeto - ele fica orfao, pago e alcancavel por caminho dentro do
--   proprio escritorio. O hook varre os caminhos antes do DELETE, o que e
--   best-effort: remove() sem permissao falha em silencio. Fechar de verdade
--   pede faxina que compare bucket com banco.
--
-- POR QUE ISTO E UMA MIGRATION, e nao configuracao no painel
--   Bucket criado no painel nao existe para a proxima maquina que aplicar o
--   projeto do zero, e policy criada no painel nao aparece em revisao de codigo.
--   As duas coisas sao schema.

-- A tabela ----------------------------------------------------------------------

create table public.map_property_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  map_property_id uuid not null,

  -- CAMINHO do objeto, nunca URL. Ver o COMMENT da coluna.
  file_path text not null,
  file_name text not null,
  mime_type text,
  byte_size bigint,

  -- A ordem do carrossel. Ver o COMMENT.
  display_order smallint not null default 0,

  uploaded_by_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint map_property_photos_id_tenant_id_key unique (id, tenant_id),
  constraint map_property_photos_tenant_id_file_path_key unique (tenant_id, file_path),

  constraint map_property_photos_file_path_not_blank_check check (btrim(file_path) <> ''),
  constraint map_property_photos_file_name_not_blank_check check (btrim(file_name) <> ''),
  constraint map_property_photos_byte_size_positive_check
    check (byte_size is null or byte_size > 0),
  constraint map_property_photos_display_order_not_negative_check
    check (display_order >= 0)
);

-- FK compostas com tenant_id, como todas as deste modulo: referencia por id
-- sozinho deixaria uma foto pendurada em propriedade de OUTRO escritorio,
-- porque a RLS filtra o que se le e nao o que se aponta.
alter table public.map_property_photos
  add constraint map_property_photos_map_property_id_fkey
  foreign key (map_property_id, tenant_id)
  references public.map_properties (id, tenant_id)
  on delete cascade;

-- Quem subiu aponta para COLABORADOR, e nao para usuario do Auth: e a escolha de
-- todo o resto do sistema - quem responde por trabalho e colaborador, e nem todo
-- colaborador tem login. SEM on delete: colaborador com foto no mapa nao some em
-- silencio, como em todas as FK deste projeto desde a 0022.
alter table public.map_property_photos
  add constraint map_property_photos_uploaded_by_id_fkey
  foreign key (uploaded_by_id, tenant_id)
  references public.collaborators (id, tenant_id);

comment on table public.map_property_photos is
  'Foto de uma propriedade do mapa, uma linha por foto, exibida no carrossel do balao do pino. NAO vem do base44: PropriedadeMapa nao tem campo de imagem e projeto-original/ nao tem tela para isto - e feature nova do escritorio, e por isso o desenho segue o que os modulos 8 (0052) e 11 (0071) ja decidiram para arquivo. Uma linha por foto, e nao array de URL dentro de map_properties, pelo mesmo motivo que terreno_tipo virou tabela filha na 0057: linha tem tenant_id proprio, FK composta, RLS propria e ordem. LIMITACAO CONHECIDA, igual as 0052 e 0071: Storage nao tem FK, entao apagar o pino leva esta linha por cascade e deixa o objeto orfao no bucket; o hook varre os caminhos antes do DELETE, o que e best-effort.';

comment on column public.map_property_photos.file_path is
  'CAMINHO do objeto no bucket map-property-photos, nunca URL. Comeca pelo tenant_id, que e o segmento que as policies de storage.objects comparam com o claim do JWT. A tela pede URL assinada de curta duracao na hora de desenhar o carrossel. Guardar URL seria guardar link que expira - ou, se o bucket fosse publico, entregar a foto da obra da residencia de um cliente a quem tivesse o endereco, que e exatamente o que a 0071 tirou do sistema.';

comment on column public.map_property_photos.file_name is
  'Nome que a pessoa escolheu no computador dela, para exibicao e para o botao de baixar. NAO entra no caminho do objeto: nome de quem envia carrega barra, ponto-ponto, unicode ambiguo e colisao. O objeto e um uuid; o nome bonito vive aqui.';

comment on column public.map_property_photos.display_order is
  'Posicao da foto no carrossel. NOT NULL com default 0: a tela grava o proximo numero livre da propriedade no momento do envio, e o empate (duas fotos com o mesmo numero, que o banco permite) e desempatado por created_at na leitura. Sem unique no par (map_property_id, display_order) de proposito - unicidade ali transformaria "reordenar" numa dança de updates intermediarios para nao bater na constraint, e o que esta em jogo e a ordem de uma fita de imagens.';

comment on column public.map_property_photos.uploaded_by_id is
  'Colaborador que enviou a foto. Nullable: a linha continua valida quando a sessao nao resolve o colaborador, e perder a foto por isso seria perder o dado por causa do rastro.';

comment on constraint map_property_photos_tenant_id_file_path_key on public.map_property_photos is
  'O mesmo objeto nao e registrado duas vezes no mesmo escritorio. O caminho ja e um uuid gerado no envio, entao colisao honesta nao acontece: o que esta constraint pega e gravacao repetida do mesmo upload (clique duplo, retentativa), que sem ela criaria duas linhas apontando para o mesmo objeto - e apagar uma delas apagaria o objeto da outra.';

-- O indice que o carrossel usa: as fotos de UMA propriedade, na ordem.
create index map_property_photos_property_id_display_order_idx
  on public.map_property_photos (tenant_id, map_property_id, display_order, created_at);

create trigger map_property_photos_set_updated_at
  before update on public.map_property_photos
  for each row execute function public.set_updated_at();

-- A RLS da tabela ---------------------------------------------------------------
--
-- Mesma matriz das outras tres tabelas do modulo (0058): le quem e colaborador
-- active do escritorio, escreve quem tem can_edit_menu('map'). Nao ha chave de
-- menu nova - a foto e parte do pino, e a tela e a mesma.
--
-- Os dois lados da tranca, escritos a mao, como a 0007 deixou registrado: RLS sem
-- GRANT da "permission denied for table"; GRANT sem RLS entrega a tabela inteira
-- para a chave publicavel. anon NAO recebe nada.
--
-- Toda chamada de funcao vai dentro de (select ...): assim o planejador a trata
-- como InitPlan e avalia UMA vez por comando, e nao uma vez por linha.

alter table public.map_property_photos enable row level security;

grant select, insert, update, delete on table public.map_property_photos to authenticated;

create policy map_property_photos_select_active_collaborator
  on public.map_property_photos
  for select
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.is_active_collaborator())
  );

comment on policy map_property_photos_select_active_collaborator on public.map_property_photos is
  'Leitura larga, igual a das outras tres tabelas do modulo (0058): qualquer colaborador active do escritorio ve as fotos dos pinos. O que se le aqui e o CAMINHO do objeto - a foto so sai do bucket com a policy de storage, que cobra o mesmo. Quem quiser apertar precisa mexer nos dois lugares ao mesmo tempo.';

create policy map_property_photos_insert_map_editor
  on public.map_property_photos
  for insert
  to authenticated
  with check (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('map'))
  );

comment on policy map_property_photos_insert_map_editor on public.map_property_photos is
  'Registrar foto e escrita no mapa, e portanto exige can_edit_menu(''map'') - a mesma chave que cria o pino. Quem so visualiza o mapa ve o carrossel e nao ve botao de adicionar: a tela esconde, e esta policy e quem recusa de verdade.';

create policy map_property_photos_update_map_editor
  on public.map_property_photos
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

comment on policy map_property_photos_update_map_editor on public.map_property_photos is
  'Reordenar ou renomear. USING e WITH CHECK pelo mesmo motivo de sempre: sem WITH CHECK, uma linha do proprio escritorio poderia ser reescrita com o tenant_id de outro.';

create policy map_property_photos_delete_map_editor
  on public.map_property_photos
  for delete
  to authenticated
  using (
    tenant_id = (select public.auth_tenant_id())
    and (select public.can_edit_menu('map'))
  );

comment on policy map_property_photos_delete_map_editor on public.map_property_photos is
  'Remover a foto da propriedade. Quem apaga a linha precisa apagar o objeto tambem: nao ha cascade entre banco e Storage - ver o cabecalho desta migration.';

-- O bucket ----------------------------------------------------------------------
--
-- Nao ha COMMENT no bucket: storage.buckets pertence a supabase_storage_admin e o
-- papel que roda as migrations (postgres) nao pode comentar tabela alheia. A
-- documentacao do bucket e este cabecalho.
--
-- 10 MB, e nao os 20 MB do bucket do diario: la cabe PDF de relatorio, aqui so
-- entra foto, e foto de celular moderno fica abaixo de 10 MB com folga. Limite
-- menor e menos conta no fim do mes e menos tempo de espera de quem envia.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'map-property-photos',
  'map-property-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- As policies do bucket ---------------------------------------------------------
--
-- O caminho do objeto e <tenant_id>/<id da propriedade>/<uuid>.<ext>, e e o
-- PRIMEIRO segmento que a policy compara com o claim do JWT. Sem isso, um bucket
-- privado continua sendo bucket compartilhado entre todos os escritorios - basta
-- um colaborador de A conhecer o caminho de um arquivo de B.
--
-- anon NAO ganha policy nenhuma: storage.objects tem RLS ligada por padrao no
-- Supabase, e sem policy nao ha acesso. O bucket ser privado e a segunda metade
-- da mesma tranca: URL publica de objeto em bucket privado nao serve o arquivo.

create policy map_property_photos_storage_select_active_collaborator
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'map-property-photos'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.is_active_collaborator())
  );

comment on policy map_property_photos_storage_select_active_collaborator on storage.objects is
  'Leitura das fotos do mapa, escopada ao escritorio pelo PRIMEIRO segmento do caminho. E ela que autoriza a emissao da URL assinada que o carrossel usa. Mesmo recorte da policy de SELECT de map_property_photos - as duas precisam mudar juntas.';

create policy map_property_photos_storage_insert_map_editor
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'map-property-photos'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.can_edit_menu('map'))
  );

comment on policy map_property_photos_storage_insert_map_editor on storage.objects is
  'Envio de foto, preso a can_edit_menu(''map'') e ao proprio escritorio. A comparacao do primeiro segmento do caminho com o claim e o que impede alguem de gravar DENTRO da pasta de outro escritorio: e o equivalente, no Storage, do WITH CHECK sobre tenant_id nas tabelas. Tipo e tamanho nao sao conferidos aqui: sao do bucket, que os aplica antes de aceitar o corpo.';

create policy map_property_photos_storage_update_map_editor
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'map-property-photos'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.can_edit_menu('map'))
  )
  with check (
    bucket_id = 'map-property-photos'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.can_edit_menu('map'))
  );

comment on policy map_property_photos_storage_update_map_editor on storage.objects is
  'Substituir um objeto ja enviado. USING e WITH CHECK pelo mesmo motivo da 0071: sem WITH CHECK, um objeto do proprio escritorio poderia ser RENOMEADO para dentro da pasta de outro, que e como se move arquivo no Storage.';

create policy map_property_photos_storage_delete_map_editor
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'map-property-photos'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.can_edit_menu('map'))
  );

comment on policy map_property_photos_storage_delete_map_editor on storage.objects is
  'Remover o objeto, preso a can_edit_menu(''map'') e ao proprio escritorio. E a segunda metade do "remover foto": a linha sai do banco primeiro, o objeto depois - ver o hook.';
