-- Modulo 8 - o bucket dos PDFs de orcamento. O UNICO upload do sistema.
--
-- POR QUE BUCKET PRIVADO, e nao publico como no original
--   No base44 o upload passa por base44.integrations.Core.UploadFile
--   (PdfUploadButton.jsx:47) e devolve um `file_url` que a tela grava no
--   documento e abre num <a href> comum (ItemOrcamentoDrawer.jsx:195,
--   PdfUploadButton.jsx:79). Ou seja: uma URL que funciona para qualquer pessoa
--   que a tenha, sem autenticacao.
--
--   O que esses arquivos contem: o orcamento de material da casa de um cliente,
--   com o nome do fornecedor, os precos cotados e, no PDF de aprovacao, a
--   decisao do cliente. Link publico vaza para quem tiver o endereco - e
--   endereco de arquivo viaja em e-mail, WhatsApp, histórico de navegador e log
--   de proxy. O original nao tinha multitenancy nem RLS para se preocupar com
--   isso; aqui um link vazado atravessaria a unica fronteira que o sistema
--   inteiro existe para manter.
--
--   Entao: bucket PRIVADO, caminho comecando pelo tenant_id, policy comparando o
--   primeiro segmento do caminho com o claim do JWT, e a tela pedindo uma URL
--   assinada de curta duracao na hora de abrir. A coluna do banco guarda o
--   CAMINHO, nunca a URL assinada - ver o COMMENT de
--   budget_checklist_items.budget_file_path (0049).
--
-- VALIDACAO NO BUCKET, e nao no navegador
--   PdfUploadButton.jsx:28-36 confere `file.type !== 'application/pdf'` e 20 MB
--   ANTES de enviar. Isso e conveniencia de quem usa, nao controle: qualquer
--   requisicao montada a mao ignora as duas checagens. Aqui os dois limites vivem
--   no bucket (allowed_mime_types e file_size_limit), que e onde o Storage os
--   aplica antes de aceitar o corpo. Os valores sao exatamente os do original:
--   somente PDF, no maximo 20 MB.
--
-- O QUE ESTE DESENHO NAO RESOLVE, e fica registrado
--   Storage nao tem FK. Apagar o item, a cotacao ou o checklist inteiro NAO apaga
--   os objetos do bucket - eles ficam orfaos, pagos e inalcancaveis pela tela. O
--   original tem exatamente o mesmo problema (e pior, porque la o arquivo orfao
--   continua publico). Fechar isso e trigger de AFTER DELETE chamando a API de
--   Storage, ou uma rotina de faxina que compara bucket com banco; nenhuma das
--   duas e decisao de schema, e nenhuma e escrita sem o usuario saber o custo.
--   Fica como pendencia declarada do modulo.
--
-- POR QUE ISTO E UMA MIGRATION, e nao configuracao no painel
--   Bucket criado no painel nao existe para a proxima maquina que aplicar o
--   projeto do zero, e policy criada no painel nao aparece em nenhuma revisao de
--   codigo. As duas coisas sao schema.

-- O bucket ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'budget-files',
  'budget-files',
  false,
  20971520,                   -- 20 MB, o mesmo MAX_SIZE_MB do PdfUploadButton
  array['application/pdf']
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
-- As policies -------------------------------------------------------------------
--
-- O caminho do objeto e <tenant_id>/<checklist_id>/<uuid>.pdf, e e o PRIMEIRO
-- segmento que a policy compara com o claim do JWT: storage.foldername(name)[1].
-- Sem isso, um bucket privado continua sendo um bucket compartilhado entre todos
-- os escritorios - basta um colaborador de A conhecer o caminho de um arquivo de
-- B.
--
-- O nome do arquivo e um uuid, e nao o nome que o usuario enviou: nome escolhido
-- por quem envia nao entra em caminho de storage (barra, ponto-ponto, unicode
-- ambiguo). O nome de exibicao vive em *_file_name, no banco.
--
-- Mesma matriz das tabelas (0050): ler exige colaborador active do escritorio;
-- escrever exige can_edit_menu('client_budget'), que e o menu dono do orcamento -
-- o arquivo e parte do orcamento, nao do cadastro de fornecedores.
--
-- anon NAO ganha policy nenhuma: storage.objects tem RLS ligada por padrao no
-- Supabase, e sem policy nao ha acesso. O bucket ser privado e a segunda metade
-- da mesma tranca: URL publica de objeto em bucket privado nao serve o arquivo.

create policy budget_files_select_active_collaborator
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'budget-files'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.is_active_collaborator())
  );

comment on policy budget_files_select_active_collaborator on storage.objects is
  'Leitura dos PDFs de orcamento, escopada ao escritorio pelo PRIMEIRO segmento do caminho. E ela que autoriza tanto o download direto quanto a emissao de URL assinada pela tela. Mesmo recorte largo das tabelas do modulo 8 (0050): colaborador active le; em Ferias ou Afastado nao le nada, nem o arquivo.';

create policy budget_files_insert_budget_editor
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'budget-files'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.can_edit_menu('client_budget'))
  );

comment on policy budget_files_insert_budget_editor on storage.objects is
  'Envio de PDF, preso ao menu client_budget e ao proprio escritorio. A comparacao do primeiro segmento do caminho com o claim e o que impede alguem de gravar um arquivo DENTRO da pasta de outro escritorio - o equivalente, no Storage, do WITH CHECK sobre tenant_id nas tabelas. Tipo e tamanho do arquivo nao sao conferidos aqui: sao do bucket, que os aplica antes de aceitar o corpo.';

create policy budget_files_update_budget_editor
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'budget-files'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.can_edit_menu('client_budget'))
  )
  with check (
    bucket_id = 'budget-files'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.can_edit_menu('client_budget'))
  );

comment on policy budget_files_update_budget_editor on storage.objects is
  'Substituir um PDF ja anexado (o botao "Substituir" do PdfUploadButton). USING e WITH CHECK pelo mesmo motivo das tabelas: sem WITH CHECK, um objeto do proprio escritorio poderia ser RENOMEADO para dentro da pasta de outro, que e como se move arquivo no Storage.';

create policy budget_files_delete_budget_editor
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'budget-files'
    and (storage.foldername(name))[1] = (select public.auth_tenant_id())::text
    and (select public.can_edit_menu('client_budget'))
  );

comment on policy budget_files_delete_budget_editor on storage.objects is
  'Remover o PDF, preso ao menu client_budget e ao proprio escritorio. Quem apaga a linha do banco precisa apagar o objeto tambem: nao ha cascade entre banco e Storage - ver o cabecalho da 0052.';
