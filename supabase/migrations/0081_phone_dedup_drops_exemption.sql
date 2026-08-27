-- A dispensa de duas linhas na deduplicacao por telefone sai: elas nao existem
-- mais.
--
-- O CASO
--   A 0076 nomeou dois clientes no predicado do indice e no trigger:
--     8db85ac3-28b7-4908-9091-ed3dd21541d8  Andre Fellype
--     3580e4d1-64c7-47c1-beb4-2ac46c3bd20d  hugo frota
--   Eram cadastros de teste de agosto/2026 que ja dividiam o telefone
--   31992027773 quando a regra entrou, e o cabecalho da 0076 registrou que a
--   excecao "some sozinha no dia em que o escritorio corrigir uma delas".
--
--   As duas foram apagadas na troca da exportacao oficial (db/ -> banco/), junto
--   com as outras 56 linhas nascidas na aplicacao durante os testes. Conferido:
--   nenhuma das duas existe, e nao ha NENHUMA colisao de telefone entre clientes
--   nascidos na aplicacao.
--
-- QUEM AVISOU FOI O TESTE
--   supabase/tests/client-phone-dedup.sql, caso 6.2 ("linha dispensada continua
--   editavel"), passou a devolver OK:0. Ele foi escrito exatamente para isso: o
--   comentario dele diz que, no dia em que a linha sumisse, o caso viraria o
--   sinal de que a dispensa podia sair da migration. Foi o que aconteceu.
--
-- POR QUE REMOVER, E NAO DEIXAR QUIETO
--   Excecao nomeada por id e divida com prazo: enquanto esta la, a regra vale
--   para todo mundo MENOS duas linhas que ninguem lembra por que estao ali. Pior,
--   dois uuid livres no predicado sao dois cadastros futuros que poderiam nascer
--   com telefone repetido se algum dia caissem nesses ids — improvavel, e ainda
--   assim uma porta aberta sem dono.
--
--   Sai dos DOIS lugares onde a 0076 a escreveu (indice e trigger), pelo mesmo
--   motivo que ela precisou entrar nos dois: metade da dispensa e pior que
--   nenhuma.
--
-- POR QUE MIGRATION NOVA
--   A 0076 ja esta aplicada. Migration aplicada nao se edita
--   (docs/ARCHITECTURE.md). O indice e recriado com o MESMO NOME de proposito: e
--   o nome que aparece na mensagem de erro e que a tela do CRM traduz.

drop index public.clients_tenant_id_phone_digits_key;

create unique index clients_tenant_id_phone_digits_key
  on public.clients (tenant_id, phone_digits)
  where phone_digits is not null
    and legacy_id is null;

comment on index public.clients_tenant_id_phone_digits_key is
  'Um telefone por escritorio, entre os clientes que NASCERAM NESTA APLICACAO. Faz "(85) 99193-8060", "85991938060" e "+55 85 99193-8060" colidirem. Nao alcanca linha importada do base44 porque o dado real do escritorio tem pares de telefone repetido vindos de la, e recusa-los apagaria cliente com contrato e recebivel pendurados; o caso "nova x importada" e coberto pelo trigger clients_reject_key_collision, que levanta o mesmo 23505 com este mesmo nome. A dispensa de duas linhas nomeadas por id, que a 0076 criou, saiu na 0081: os dois cadastros foram apagados e nao ha mais colisao entre linhas nascidas na aplicacao.';

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

  -- Telefone (0076). Ultimo de proposito: documento e e-mail identificam a
  -- PESSOA, telefone identifica o canal. Quando os dois batem, a mensagem util e
  -- a do documento, e quem escolhe qual mensagem a tela mostra e a ordem em que
  -- as excecoes sao levantadas aqui.
  --
  -- A dispensa por id que a 0076 tinha aqui saiu na 0081, junto com as duas
  -- linhas que a justificavam.
  if new.phone_digits is not null then
    select c.id into v_other
      from public.clients c
     where c.tenant_id = new.tenant_id
       and c.phone_digits = new.phone_digits
       and c.id <> new.id
     limit 1;

    if v_other is not null then
      raise exception
        'duplicate key value violates unique constraint "clients_tenant_id_phone_digits_key"'
        using errcode = 'unique_violation',
              detail = 'Ja existe um cliente com este telefone neste escritorio.',
              hint = 'Abra o cadastro existente em vez de criar um segundo.';
    end if;
  end if;

  return null;
end;
$$;

comment on function public.clients_reject_key_collision() is
  'A metade da deduplicacao de cliente que um indice nao consegue expressar: cliente que NASCE nesta aplicacao nao pode repetir o documento, a chave nem o TELEFONE de um cliente IMPORTADO do base44, embora dois importados possam se repetir entre si (0065 para documento e chave, 0076 para telefone). Levanta 23505 com o nome do indice na mensagem, exatamente como o indice levantaria, para que a tela de CRM continue traduzindo o erro e mostrando quem ocupa o valor sem nenhuma mudanca no frontend. AFTER, e nao BEFORE: tax_id_digits, client_key e phone_digits sao colunas GERADAS, e o Postgres so as calcula depois dos triggers BEFORE - em BEFORE elas chegariam nulas e a conferencia nao conferiria nada. SECURITY DEFINER para que a garantia de unicidade nao dependa de a policy de SELECT de clients continuar larga: a consulta e restrita a new.tenant_id, que a propria policy de escrita ja obriga a ser o do usuario. A dispensa de duas linhas nomeadas por id (0076) saiu na 0081.';
