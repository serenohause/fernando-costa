-- A deduplicacao de cliente passa a valer sobre o que NASCE AQUI, e nao entre
-- duas linhas importadas do base44.
--
-- O CASO
--   3 clientes estao cadastrados duas vezes no base44 - mesmo CPF/CNPJ, mesmo
--   e-mail e mesmo nome exato, tres pares. Os dois indices unicos de clients
--   (tax_id_digits e client_key) derrubam a segunda linha de cada par, e derrubam
--   com ela tudo que aponta para essa segunda linha.
--
--   Nao ha resposta correta AUTOMATICA para "qual das duas fica": as duas tem
--   negociacao, contrato ou parcela penduradas em graus diferentes, e fundir e
--   decisao de negocio. O que o banco pode fazer e deixar as SEIS linhas entrarem
--   e a fusao virar decisao do escritorio com os dois registros a vista, em vez
--   de decisao do script com um deles ja perdido.
--
-- A FORMA, E POR QUE ELA NAO E SO "INDICE PARCIAL"
--   O pedido natural e tornar os dois indices parciais (`where legacy_id is
--   null`). Isso resolve metade: duas linhas nascidas aqui continuam colidindo,
--   e duas linhas importadas passam a conviver. Mas abre um buraco que nao
--   existia: uma linha NOVA deixaria de colidir com uma linha IMPORTADA, porque
--   a importada nao estaria mais no indice. Como 118 dos 133 clientes deste
--   banco vieram da importacao, a deduplicacao pararia de proteger justamente a
--   base inteira do escritorio - digitar o CPF de um cliente existente criaria um
--   segundo cadastro em silencio, que e exatamente o que o modulo 2 foi desenhado
--   para impedir (e o que a tela de CRM ja trata: ao esbarrar em 23505 ela mostra
--   o cliente que ocupa o documento, com link).
--
--   Entao sao DUAS pecas, e a regra que elas formam junta e:
--   "linha que nasce aqui nao pode colidir com NADA; linha importada convive com
--   linha importada".
--
--     a) INDICE UNICO PARCIAL (where legacy_id is null) - segura o caso nova x
--        nova, e segura com garantia de indice: duas requisicoes simultaneas nao
--        passam as duas. E o motivo pelo qual a protecao e um indice e nao uma
--        consulta previa (ver o COMMENT da unique de accounts_receivable, 0041).
--
--     b) TRIGGER - segura o caso nova x importada, que nenhum indice consegue
--        expressar (a assimetria "A colide com B mas B nao colide com A" nao e
--        indexavel). Levanta o MESMO SQLSTATE 23505, com o nome do indice na
--        mensagem, para que a tela continue se comportando como hoje sem uma
--        linha de mudanca em src/.
--
--        A janela de corrida do trigger e a diferenca entre ele e um indice, e
--        ela e aceitavel aqui: para dois cadastros simultaneos do mesmo
--        documento, (a) ja pega; o que sobra e "cadastro novo no mesmo instante
--        de uma reimportacao", e a importacao roda uma vez, fora do horario de
--        uso.
--
-- OS INDICES DE LEITURA QUE ESTA MIGRATION PRECISA CRIAR
--   Tornar os unicos parciais tira do indice as linhas importadas - e sao elas
--   que a busca de duplicata do frontend (findConflictingClient, por
--   tax_id_digits) e o proprio trigger consultam. Sem indice proprio, essa busca
--   viraria varredura. Entram dois indices NAO-unicos cobrindo todas as linhas.
--
-- AUDITORIA
--   Os pares importados que so existem por causa desta migration:
--     select tax_id_digits, count(*), array_agg(id)
--       from public.clients
--      where tax_id_digits is not null
--      group by tenant_id, tax_id_digits having count(*) > 1;
--
-- POR QUE MIGRATION NOVA
--   A 0015 ja esta aplicada. Migration aplicada nao se edita
--   (docs/ARCHITECTURE.md). Os dois indices sao recriados com o MESMO NOME de
--   proposito: e o nome que aparece na mensagem de erro e que a investigacao
--   procura.

-- a) Os dois unicos, agora parciais --------------------------------------------

drop index public.clients_tenant_id_tax_id_digits_key;
drop index public.clients_tenant_id_client_key_key;

create unique index clients_tenant_id_tax_id_digits_key
  on public.clients (tenant_id, tax_id_digits)
  where tax_id_digits is not null and legacy_id is null;

create unique index clients_tenant_id_client_key_key
  on public.clients (tenant_id, client_key)
  where client_key is not null and legacy_id is null;

comment on index public.clients_tenant_id_tax_id_digits_key is
  'Um documento por escritorio, entre os clientes que NASCERAM NESTA APLICACAO. Faz "123.456.789-00" e "12345678900" colidirem, que era o objetivo declarado do cpf_cnpj_norm do original e que o original nao chega a impedir. Por escritorio, e nao global: dois escritorios podem atender o mesmo cliente. A CONDICAO legacy_id is null EXISTE POR CAUSA DA IMPORTACAO: 3 clientes estao cadastrados duas vezes no base44, e recusar a segunda linha de cada par perderia o registro com o qual o escritorio vai decidir a fusao. Sozinha, essa condicao abriria o caso "linha nova nao colide com linha importada" - quem fecha esse caso e o trigger clients_reject_key_collision, nesta mesma migration.';

comment on index public.clients_tenant_id_client_key_key is
  'Um cliente por escritorio pela chave de deduplicacao: mesmo documento, ou - quando nao ha documento - mesmo e-mail, inclusive digitado com outra caixa. Entre os clientes que NASCERAM NESTA APLICACAO; para a importacao vale o mesmo que esta escrito no indice de tax_id_digits. LIMITE HERDADO DO ORIGINAL: como o documento tem precedencia na chave, duas linhas com o MESMO e-mail convivem se uma delas tiver documento (pessoa fisica e a empresa dela, por exemplo). Fechar isso pediria unique sobre email_normalized, que o dominio nao autoriza - casal que compartilha e-mail e cadastro normal no escritorio.';

-- Os dois indices de leitura sobre TODAS as linhas. Servem o trigger abaixo e a
-- busca de duplicata da tela, que precisam enxergar tambem o cliente importado.
create index clients_tenant_id_tax_id_digits_idx
  on public.clients (tenant_id, tax_id_digits)
  where tax_id_digits is not null;

create index clients_tenant_id_client_key_idx
  on public.clients (tenant_id, client_key)
  where client_key is not null;

comment on index public.clients_tenant_id_tax_id_digits_idx is
  'Indice de LEITURA por documento, sobre todas as linhas - inclusive as importadas, que a partir da 0065 nao estao mais no indice unico. Dois usos: o trigger clients_reject_key_collision e a busca que a tela faz depois de um 23505 para dizer QUEM ocupa aquele documento.';

comment on index public.clients_tenant_id_client_key_idx is
  'Gemeo de clients_tenant_id_tax_id_digits_idx para a chave de deduplicacao. Mesmo motivo.';

-- b) O trigger que fecha "linha nova x linha importada" -------------------------

create or replace function public.clients_reject_key_collision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other uuid;
begin
  -- Linha importada nao e conferida: e ela que a excecao existe para deixar
  -- entrar, e duas importadas podem conviver.
  if new.legacy_id is not null then
    return null;
  end if;

  if new.tax_id_digits is not null then
    select c.id into v_other
      from public.clients c
     where c.tenant_id = new.tenant_id
       and c.tax_id_digits = new.tax_id_digits
       and c.id <> new.id
     limit 1;

    if v_other is not null then
      raise exception
        'duplicate key value violates unique constraint "clients_tenant_id_tax_id_digits_key"'
        using errcode = 'unique_violation',
              detail = 'Ja existe um cliente com este CPF/CNPJ neste escritorio.',
              hint = 'Abra o cadastro existente em vez de criar um segundo.';
    end if;
  end if;

  if new.client_key is not null then
    select c.id into v_other
      from public.clients c
     where c.tenant_id = new.tenant_id
       and c.client_key = new.client_key
       and c.id <> new.id
     limit 1;

    if v_other is not null then
      raise exception
        'duplicate key value violates unique constraint "clients_tenant_id_client_key_key"'
        using errcode = 'unique_violation',
              detail = 'Ja existe um cliente com este documento ou e-mail neste escritorio.',
              hint = 'Abra o cadastro existente em vez de criar um segundo.';
    end if;
  end if;

  return null;
end;
$$;

comment on function public.clients_reject_key_collision() is
  'A metade da deduplicacao de cliente que um indice nao consegue expressar: cliente que NASCE nesta aplicacao nao pode repetir o documento nem a chave de um cliente IMPORTADO do base44, embora dois importados possam se repetir entre si (0065). Levanta 23505 com o nome do indice na mensagem, exatamente como o indice levantaria, para que a tela de CRM continue traduzindo o erro e mostrando quem ocupa o documento sem nenhuma mudanca no frontend. AFTER, e nao BEFORE: tax_id_digits e client_key sao colunas GERADAS, e o Postgres so as calcula depois dos triggers BEFORE - em BEFORE elas chegariam nulas e a conferencia nao conferiria nada. SECURITY DEFINER para que a garantia de unicidade nao dependa de a policy de SELECT de clients continuar larga: a consulta e restrita a new.tenant_id, que a propria policy de escrita ja obriga a ser o do usuario.';

create trigger clients_reject_key_collision
  after insert or update of tenant_id, tax_id, email, legacy_id on public.clients
  for each row execute function public.clients_reject_key_collision();
