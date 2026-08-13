-- Modulo 11 (Diario do Projeto) - o bucket dos anexos e das fotos de obra.
--
-- POR QUE UM BUCKET NOVO, E NAO O budget-files DA 0052
--   Duas razoes, e as duas sao de controle, nao de arrumacao:
--
--   1. TIPO DE ARQUIVO. O budget-files aceita SOMENTE application/pdf, e esse
--      recorte e do modulo 8 - e ele que impede alguem subir qualquer coisa
--      disfarcada de orcamento. Este modulo precisa de imagem (a foto da obra e
--      o dado principal da aba Obra) e de texto puro (um dos 5 anexos reais do
--      base44 e conversa exportada). Ampliar a lista de MIME do budget-files
--      afrouxaria um controle do modulo 8 por causa do 11.
--
--   2. CHAVE DE PERMISSAO. As policies do budget-files sao gatilhadas por
--      can_edit_menu('client_budget'). Aqui a escrita e por FUNCAO - Diretor ou
--      Coordenador (ver a excecao explicada no cabecalho da 0070). Somar uma
--      quinta policy com outra regra ao mesmo bucket faria dois modulos
--      dividirem a mesma superficie, e uma mudanca de um passaria a mexer no
--      outro sem que nada acusasse.
--
--   A FORMA e copiada da 0052, porque ela ja esta certa: bucket privado, limite
--   no bucket e nao no navegador, caminho comecando pelo tenant_id, nome de
--   objeto em uuid, quatro policies em storage.objects, anon sem nada.
--
-- O QUE ESTE BUCKET GUARDA, E POR QUE PRIVADO IMPORTA MAIS AQUI
--   Foto da obra da residencia de um cliente, com data e endereco implicitos.
--   No base44 o upload devolve URL PUBLICA do base44.app e a tela a grava no
--   documento (IssueForm.jsx:78) - endereco de arquivo viaja em e-mail, WhatsApp,
--   historico de navegador e log de proxy, e quem tiver o endereco ve a foto. A
--   coluna do banco aqui guarda o CAMINHO, nunca a URL; a tela pede URL assinada
--   de curta duracao na hora de abrir, como no modulo 8.
--
-- O QUE ESTE DESENHO NAO RESOLVE, e fica registrado (igual a 0052)
--   Storage nao tem FK. Apagar a entrada, a visita ou a pendencia leva a linha
--   de project_diary_files por cascade e NAO apaga o objeto - ele fica orfao,
--   pago e alcancavel por caminho dentro do proprio escritorio. Os hooks varrem
--   os caminhos antes do DELETE (defeito 14 do plano), o que e best-effort:
--   remove() sem permissao falha em silencio. Fechar de verdade pede faxina que
--   compare bucket com banco.
--
-- POR QUE ISTO E UMA MIGRATION, e nao configuracao no painel
--   Bucket criado no painel nao existe para a proxima maquina que aplicar o
--   projeto do zero, e policy criada no painel nao aparece em nenhuma revisao de
--   codigo. As duas coisas sao schema.

-- O bucket ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-diary-files',
  'project-diary-files',
  false,
  20971520,                   -- 20 MB, o mesmo limite do bucket do modulo 8
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'text/plain'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Nao ha COMMENT no bucket: storage.buckets pertence a supabase_storage_admin e
-- o papel que roda as migrations (postgres) nao pode comentar tabela alheia -
-- COMMENT exige dono, ao contrario de CREATE POLICY, que o Supabase libera. A
-- documentacao do bucket e este cabecalho.
--
-- A LISTA DE MIME E UM PISO DE CONTROLE, NAO UMA LISTA DE CONVENIENCIA. Os cinco
-- valores cobrem exatamente o que as telas do modulo enviam: foto de obra
-- (jpeg/png/webp, os tres formatos que um celular ou um navegador produzem),
-- documento anexado ao registro (pdf) e o anexo de texto que existe no dado real
-- do base44. Formato novo entra por migration, e nao por excecao no codigo do
-- upload - foi isso que a 0052 registrou e continua valendo: validacao no
-- navegador (IssueForm.jsx confere accept="image/*") e conveniencia de quem usa,
-- nao controle; qualquer requisicao montada a mao ignora o accept.

-- As policies -------------------------------------------------------------------
--
-- O caminho do objeto e <tenant_id>/<mae>/<id da mae>/<uuid>.<ext>, e e o
-- PRIMEIRO segmento que a policy compara com o claim do JWT:
-- storage.foldername(name)[1]. Sem isso, um bucket privado continua sendo um
-- bucket compartilhado entre todos os escritorios - basta um colaborador de A
-- conhecer o caminho de um arquivo de B.
--
-- O nome do arquivo e um uuid, e nao o nome que a pessoa enviou: nome escolhido
-- por quem envia nao entra em caminho de storage (barra, ponto-ponto, unicode
-- ambiguo). O nome de exibicao vive em project_diary_files.file_name, no banco.
--
-- Mesma matriz das tabelas (0070): ler exige colaborador active do escritorio;
-- escrever exige Diretor ou Coordenador, pela funcao is_project_diary_writer().
-- Nenhuma escrita automatica toca o bucket - evento de sistema nao tem anexo -,
-- entao a excecao de permissao da 0070 nao se estende ate aqui.
--
-- anon NAO ganha policy nenhuma: storage.objects tem RLS ligada por padrao no
-- Supabase, e sem policy nao ha acesso. O bucket ser privado e a segunda metade
-- da mesma tranca: URL publica de objeto em bucket privado nao serve o arquivo.

create policy diary_files_select_active_collaborator
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'project-diary-files'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.is_active_collaborator())
  );

comment on policy diary_files_select_active_collaborator on storage.objects is
  'Leitura dos anexos e fotos do diario, escopada ao escritorio pelo PRIMEIRO segmento do caminho. E ela que autoriza tanto o download direto quanto a emissao de URL assinada pela tela. Recorte largo, igual ao das tabelas do modulo 11 (0070) e ao do modulo 8 (0052): colaborador active le; em Ferias ou Afastado nao le nada, nem o arquivo. Quem quiser apertar precisa mexer AQUI e na policy de SELECT de project_diary_files ao mesmo tempo.';

create policy diary_files_insert_diary_writer
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'project-diary-files'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.is_project_diary_writer())
  );

comment on policy diary_files_insert_diary_writer on storage.objects is
  'Envio de foto ou anexo, preso a Diretor/Coordenador e ao proprio escritorio - a mesma regra da escrita manual nas tabelas do modulo (0070), porque anexar arquivo e sempre gesto manual. A comparacao do primeiro segmento do caminho com o claim e o que impede alguem de gravar um arquivo DENTRO da pasta de outro escritorio: e o equivalente, no Storage, do WITH CHECK sobre tenant_id nas tabelas. Tipo e tamanho do arquivo nao sao conferidos aqui: sao do bucket, que os aplica antes de aceitar o corpo.';

create policy diary_files_update_diary_writer
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'project-diary-files'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.is_project_diary_writer())
  )
  with check (
    bucket_id = 'project-diary-files'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.is_project_diary_writer())
  );

comment on policy diary_files_update_diary_writer on storage.objects is
  'Substituir um arquivo ja anexado. USING e WITH CHECK pelo mesmo motivo das tabelas: sem WITH CHECK, um objeto do proprio escritorio poderia ser RENOMEADO para dentro da pasta de outro, que e como se move arquivo no Storage.';

create policy diary_files_delete_diary_writer
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'project-diary-files'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.is_project_diary_writer())
  );

comment on policy diary_files_delete_diary_writer on storage.objects is
  'Remover o objeto, preso a Diretor/Coordenador e ao proprio escritorio. Quem apaga a linha de project_diary_files precisa apagar o objeto tambem: nao ha cascade entre banco e Storage - ver o cabecalho desta migration.';
