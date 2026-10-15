-- Unificar dois cadastros de cliente que sao a mesma pessoa.
--
-- POR QUE EXISTE
--   O CRM recusa documento e telefone repetidos (0076, 0096), mas a trava e
--   PARCIAL: `where legacy_id is null`. Linha importada do base44 escapa dela, e
--   duas linhas importadas da mesma pessoa convivem — mesmo telefone e mesmo
--   e-mail, cada uma com o CNPJ de uma SPE diferente. Ja aconteceu em producao
--   com um cliente; o registro da execucao fica em `backup/` (fora do git,
--   porque tem dado real).
--
-- O QUE ELE FAZ
--   Aponta para o cadastro que fica (SOBREVIVENTE) tudo que esta pendurado no
--   que sai (ABSORVIDO) — negociacao, contrato, projeto, recebivel, atividade,
--   orcamento, briefing, pessoa vinculada, imovel no mapa e indicacao — depois
--   apaga o absorvido. Nada e recalculado a mao: `search_text` e `search_plain`
--   sao colunas geradas e se refazem sozinhas.
--
-- O QUE ELE NAO PERDE
--   CNPJ e razao social de cada contrato ficam NO CONTRATO (`client_tax_id`,
--   `client_legal_name`), nao no cadastro. Unificar o cadastro nao mistura os
--   documentos dos contratos: cada um continua com o seu.
--
-- CUIDADO COM REIMPORTACAO
--   `scripts/import-base44.mjs` faz upsert por `(tenant_id, legacy_id)`, e os
--   dois cadastros tem `legacy_id`. Se o import rodar de novo, o cadastro
--   apagado VOLTA e as linhas dele sao reapontadas para ele — a uniao se
--   desfaz, e tem de ser refeita depois do import.
--
-- COMO USAR
--   Editar os dois uuids e, se for o caso, o bloco "dados que ficam". Rodar
--   primeiro com `rollback` no fim (e conferir o relatorio), depois trocar para
--   `commit`.

begin;

create temp table alvo on commit drop as select
  /* Os dois uuids. SOBREVIVENTE e o cadastro que fica com tudo; ABSORVIDO e o
     que deixa de existir. A escolha e do escritorio, nao tecnica: o que fica
     carrega o nome, o documento e a cidade que vao aparecer no CRM. */
  '00000000-0000-0000-0000-000000000000'::uuid as sobrevivente,
  '00000000-0000-0000-0000-000000000000'::uuid as absorvido;

/* Trava: os dois tem de existir, ser do MESMO escritorio e ser dois. Sem isto,
   um uuid digitado errado viraria um update silencioso em zero linhas. */
do $BODY$
declare n int; t int;
begin
  select count(*), count(distinct tenant_id) into n, t
  from public.clients where id in (select sobrevivente from alvo union all select absorvido from alvo);
  if n <> 2 then raise exception 'esperava 2 cadastros, achei %', n; end if;
  if t <> 1 then raise exception 'os dois cadastros nao sao do mesmo escritorio'; end if;
end
$BODY$;

create temp table antes on commit drop as
select 'negotiations' as tabela, count(*) from public.negotiations where client_id = (select absorvido from alvo)
union all select 'contracts', count(*) from public.contracts where client_id = (select absorvido from alvo)
union all select 'projects', count(*) from public.projects where client_id = (select absorvido from alvo)
union all select 'accounts_receivable', count(*) from public.accounts_receivable where client_id = (select absorvido from alvo)
union all select 'activities', count(*) from public.activities where client_id = (select absorvido from alvo)
union all select 'budget_checklists', count(*) from public.budget_checklists where client_id = (select absorvido from alvo)
union all select 'client_intakes', count(*) from public.client_intakes where client_id = (select absorvido from alvo)
union all select 'client_people', count(*) from public.client_people where client_id = (select absorvido from alvo)
union all select 'map_properties', count(*) from public.map_properties where client_id = (select absorvido from alvo)
union all select 'clients.referrer', count(*) from public.clients where referrer_client_id = (select absorvido from alvo);

-- Reapontar ---------------------------------------------------------------------

update public.negotiations set client_id = (select sobrevivente from alvo) where client_id = (select absorvido from alvo);
update public.contracts set client_id = (select sobrevivente from alvo) where client_id = (select absorvido from alvo);
update public.projects set client_id = (select sobrevivente from alvo) where client_id = (select absorvido from alvo);
update public.accounts_receivable set client_id = (select sobrevivente from alvo) where client_id = (select absorvido from alvo);
update public.activities set client_id = (select sobrevivente from alvo) where client_id = (select absorvido from alvo);
update public.budget_checklists set client_id = (select sobrevivente from alvo) where client_id = (select absorvido from alvo);
update public.client_intakes set client_id = (select sobrevivente from alvo) where client_id = (select absorvido from alvo);
update public.client_people set client_id = (select sobrevivente from alvo) where client_id = (select absorvido from alvo);
update public.map_properties set client_id = (select sobrevivente from alvo) where client_id = (select absorvido from alvo);
update public.clients set referrer_client_id = (select sobrevivente from alvo) where referrer_client_id = (select absorvido from alvo);

/* A etiqueta do mapa e texto solto, copiado do cliente no momento em que o pino
   foi criado. Reapontar o pino sem acertar a etiqueta deixaria o mapa dizendo
   um nome e o cadastro dizendo outro. */
update public.map_properties
   set client_label = (select name from public.clients where id = (select sobrevivente from alvo))
 where client_id = (select sobrevivente from alvo)
   and client_label is not null;

-- Dados que ficam no cadastro sobrevivente -----------------------------------------

/* Se a ficha que fica precisar nascer com outro nome, documento ou cidade — por
   exemplo o nome com a grafia correta, que estava na ficha que sai — e aqui:

   update public.clients
      set name = '<nome>', tax_id = '<documento>', address_city = '<cidade>'
    where id = (select sobrevivente from alvo);

   Nada disso mexe nos contratos: CNPJ e razao social de cada um ficam no
   proprio contrato. */

-- Apagar o absorvido ---------------------------------------------------------------

/* As FKs de negociacao, contrato, projeto e recebivel NAO sao cascade: se
   alguma linha tiver ficado atras, o delete falha aqui em vez de levar dado
   junto. A pessoa vinculada e a unica cascade, e ela foi reapontada acima. */
delete from public.clients where id = (select absorvido from alvo);

-- Relatorio --------------------------------------------------------------------------

select a.tabela,
       a.count as antes_no_absorvido,
       case a.tabela
         when 'negotiations' then (select count(*) from public.negotiations where client_id = (select sobrevivente from alvo))
         when 'contracts' then (select count(*) from public.contracts where client_id = (select sobrevivente from alvo))
         when 'projects' then (select count(*) from public.projects where client_id = (select sobrevivente from alvo))
         when 'accounts_receivable' then (select count(*) from public.accounts_receivable where client_id = (select sobrevivente from alvo))
         when 'activities' then (select count(*) from public.activities where client_id = (select sobrevivente from alvo))
         when 'budget_checklists' then (select count(*) from public.budget_checklists where client_id = (select sobrevivente from alvo))
         when 'client_intakes' then (select count(*) from public.client_intakes where client_id = (select sobrevivente from alvo))
         when 'client_people' then (select count(*) from public.client_people where client_id = (select sobrevivente from alvo))
         when 'map_properties' then (select count(*) from public.map_properties where client_id = (select sobrevivente from alvo))
         else (select count(*) from public.clients where referrer_client_id = (select sobrevivente from alvo))
       end as depois_no_sobrevivente,
       (select count(*) from public.clients where id = (select absorvido from alvo))::text as absorvido_ainda_existe,
       (select name from public.clients where id = (select sobrevivente from alvo)) as nome_final,
       (select search_plain from public.clients where id = (select sobrevivente from alvo)) as busca_final
from antes a order by a.tabela;

rollback;
