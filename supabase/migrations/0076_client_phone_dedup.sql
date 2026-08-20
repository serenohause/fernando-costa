-- Telefone passa a ser chave de deduplicacao de cliente, como o CPF/CNPJ.
--
-- DECISAO DO USUARIO, tomada com o dado real a vista
--   Pedido: "CRM - nao permitir duplicar telefones no cadastro de leads".
--
--   Antes de escrever esta migration os 141 clientes do banco foram medidos. Ha
--   4 pares com o mesmo telefone no escritorio Fernando Costa, e eles NAO sao
--   todos erro:
--
--     - Ideberg Jaco Maia + Jamilly Alves Pereira Maia: CPF diferente, mesmo
--       celular. Casal.
--     - Junior Sintonia, dois CNPJ diferentes: mesma pessoa, duas empresas.
--     - Vilma Freire duas vezes: mesmo CPF, mesmo e-mail. Duplicata pura.
--     - Andre Fellype + hugo frota: nascidos nesta aplicacao, em agosto/2026.
--
--   Ou seja: telefone compartilhado EXISTE e e legitimo no dominio. O mesmo
--   argumento ja tinha sido usado neste projeto para NAO tornar o e-mail unico
--   (ver o COMMENT de clients_tenant_id_client_key_key: "casal que compartilha
--   e-mail e cadastro normal no escritorio").
--
--   O usuario foi informado disso, com os quatro pares na mesa, e escolheu
--   RECUSAR DE VEZ. Fica registrado aqui o que essa escolha custa: cadastrar
--   conjuge, socio ou filho que usa o mesmo celular passa a ser impossivel pela
--   tela — `phone` e not null, entao nao ha nem a saida de deixar em branco. Se
--   o escritorio esbarrar nisso, a mudanca e afrouxar esta restricao, e a
--   discussao ja esta escrita.
--
-- A FORMA E A MESMA DA 0065, E PELOS MESMOS MOTIVOS
--   Duas pecas, formando a regra "linha que nasce aqui nao pode colidir com
--   NADA; linha importada convive com linha importada":
--
--     a) INDICE UNICO PARCIAL (where legacy_id is null) — segura nova x nova com
--        garantia de indice, que duas requisicoes simultaneas nao furam.
--     b) TRIGGER — segura nova x importada, assimetria que nenhum indice
--        expressa. Levanta o MESMO 23505 com o nome do indice na mensagem.
--
--   Sem (b), os 3 pares importados sairiam do indice e cadastrar o telefone de
--   um cliente existente criaria um segundo cadastro em silencio — o oposto do
--   que este pedido quer.
--
-- POR QUE UMA COLUNA GERADA, E NAO COMPARAR `phone` DIRETO
--   `phone` guarda o texto como a pessoa digitou, com pontuacao (COMMENT da
--   coluna, migration 0015), e o dado real prova que a mesma linha telefonica
--   aparece escrita de varias formas: "(85) 98686-2020" e "'+55 85 98686-2020"
--   sao o MESMO telefone e sao dois textos diferentes. Comparar o texto cru
--   deixaria passar justamente a duplicata que este pedido quer barrar — um dos
--   4 pares so aparece depois de normalizar.
--
--   O DDI brasileiro sai quando ele e claramente DDI, e a conta e por
--   comprimento: numero nacional tem 10 (fixo) ou 11 (celular) digitos, entao
--   12 ou 13 digitos comecando em 55 sao DDI + numero. O corte NAO se aplica a
--   11 digitos comecando em 55, que e o DDD 55 (Santa Maria/RS) — cortar ali
--   destruiria numero valido.
--
--   Nada alem disso e adivinhado. Numero malformado (ha um de 4 digitos e dois
--   de 12 que nao comecam em 55, todos importados) fica como esta: inventar o
--   que falta seria gravar como fato um numero que ninguem digitou.
--
-- POR QUE COLUNA GERADA E NAO ESCRITA PELO FRONTEND
--   Mesmo motivo de tax_id_digits, escrito por extenso no COMMENT dela: campo
--   derivado escrito pela aplicacao so esta correto enquanto TODA escrita passar
--   pelo mesmo caminho, e importacao, correcao a mao ou tela nova o deixam
--   desalinhado sem ninguem perceber — e ai a deduplicacao para de ver duplicata
--   que existe.
--
-- AS DUAS LINHAS DISPENSADAS, E POR QUE ELAS SAO NOMEADAS UMA A UMA
--   Dois clientes NASCIDOS nesta aplicacao ja dividem o telefone 31992027773:
--
--     8db85ac3-28b7-4908-9091-ed3dd21541d8  Andre Fellype  criado 19/08/2026
--     3580e4d1-64c7-47c1-beb4-2ac46c3bd20d  hugo frota     criado 11/08/2026
--
--   Os dois tem o mesmo e-mail e nasceram durante o periodo de testes do
--   escritorio, mas tem negociacao, contrato, projeto e recebivel pendurados —
--   nenhum e descartavel, e inventar um telefone novo para um deles seria gravar
--   como fato um numero que ninguem digitou.
--
--   Decisao do usuario: a regra vale DAQUI PRA FRENTE. As duas linhas ficam como
--   estao e nao participam da unicidade.
--
--   A dispensa e por ID, e nao por data de criacao, de proposito. "Tudo que
--   existe hoje" tiraria os outros 139 clientes do indice sem nenhum conflito
--   justificando — a regra nasceria com um buraco do tamanho da base. Nomeando
--   as duas linhas, a excecao e exatamente do tamanho do problema, e some sozinha
--   no dia em que o escritorio corrigir uma delas.
--
--   A dispensa aparece em DOIS lugares (indice e trigger) porque senao as duas
--   linhas ficariam INEDITAVEIS: salvar qualquer campo do cadastro reenvia
--   `phone`, o trigger acordaria, acharia a outra linha e recusaria a gravacao.
--   Dispensar no indice e esquecer no trigger seria travar dois cadastros reais
--   em nome de uma regra que eles nao precisam cumprir.
--
-- AUDITORIA
--   Se as duas linhas ainda colidem (ou seja, se a dispensa ainda e necessaria):
--     select id, name, phone_digits from public.clients
--      where id in ('8db85ac3-28b7-4908-9091-ed3dd21541d8',
--                   '3580e4d1-64c7-47c1-beb4-2ac46c3bd20d');
--
--   Os pares importados que sobrevivem por causa da excecao de legacy_id:
--     select phone_digits, count(*), array_agg(name)
--       from public.clients
--      where phone_digits is not null
--      group by tenant_id, phone_digits having count(*) > 1;

-- a) A coluna normalizada ------------------------------------------------------

alter table public.clients
  add column phone_digits text
    generated always as (
      nullif(
        case
          when length(regexp_replace(phone, '[^0-9]+', '', 'g')) in (12, 13)
           and left(regexp_replace(phone, '[^0-9]+', '', 'g'), 2) = '55'
          then substring(regexp_replace(phone, '[^0-9]+', '', 'g') from 3)
          else regexp_replace(phone, '[^0-9]+', '', 'g')
        end,
        ''
      )
    ) stored;

comment on column public.clients.phone_digits is
  'phone reduzido a digitos e sem o DDI brasileiro, calculado pelo banco. E por esta coluna que a deduplicacao por telefone compara, nunca pelo texto de phone: a mesma linha telefonica aparece no dado real escrita de varias formas, e "(85) 98686-2020" e "+55 85 98686-2020" precisam colidir. O 55 sai apenas quando o numero tem 12 ou 13 digitos, porque numero nacional tem 10 ou 11 - com 11 digitos, 55 e o DDD de Santa Maria/RS e cortar destruiria numero valido. Nulo quando phone nao tem digito algum. Coluna GERADA para nao depender de toda escrita lembrar de normalizar (mesmo motivo de tax_id_digits).';

-- b) O unico parcial, mesma forma da 0065 --------------------------------------

create unique index clients_tenant_id_phone_digits_key
  on public.clients (tenant_id, phone_digits)
  where phone_digits is not null
    and legacy_id is null
    -- As duas linhas dispensadas. Ver o bloco no cabecalho.
    and id <> '8db85ac3-28b7-4908-9091-ed3dd21541d8'
    and id <> '3580e4d1-64c7-47c1-beb4-2ac46c3bd20d';

comment on index public.clients_tenant_id_phone_digits_key is
  'Um telefone por escritorio, entre os clientes que NASCERAM NESTA APLICACAO, menos duas linhas nomeadas no predicado (ver o cabecalho da 0076: dois cadastros de teste de agosto/2026 que ja dividiam o telefone quando a regra entrou, e que tem contrato e recebivel pendurados). Faz "(85) 99193-8060", "85991938060" e "+55 85 99193-8060" colidirem. Nao alcanca linha importada do base44 porque o dado real do escritorio tem 3 pares de telefone repetido vindos de la, e recusa-los apagaria cliente com contrato e recebivel pendurados; o caso "nova x importada" e coberto pelo trigger clients_reject_key_collision, que levanta o mesmo 23505 com este mesmo nome. Por escritorio, e nao global: dois escritorios podem atender o mesmo cliente.';

-- c) O indice de leitura, que o unico parcial deixa de servir -------------------
--
--    Mesmo raciocinio da 0065: o unico nao cobre linha importada, e sao elas que
--    a busca de duplicata da tela e o proprio trigger consultam. Sem este, a
--    consulta viraria varredura.

create index clients_tenant_id_phone_digits_idx
  on public.clients (tenant_id, phone_digits)
  where phone_digits is not null;

comment on index public.clients_tenant_id_phone_digits_idx is
  'Gemeo nao-unico de clients_tenant_id_phone_digits_key, cobrindo TODAS as linhas. Serve a busca "quem ja tem este telefone" que a tela do CRM faz para mostrar o cadastro existente com link, e a consulta do trigger clients_reject_key_collision - as duas precisam enxergar as linhas importadas, que o indice unico parcial nao cobre.';

-- d) A metade que o indice nao expressa ----------------------------------------

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
  -- `new.id not in (...)`: as duas linhas que ja dividiam telefone quando esta
  -- regra entrou. Sem isto elas ficariam INEDITAVEIS - salvar qualquer campo do
  -- cadastro reenvia `phone`, este trigger acordaria e recusaria a gravacao por
  -- causa de uma colisao que a decisao do usuario dispensou. Ver o cabecalho.
  if new.phone_digits is not null
     and new.id not in (
       '8db85ac3-28b7-4908-9091-ed3dd21541d8'::uuid,
       '3580e4d1-64c7-47c1-beb4-2ac46c3bd20d'::uuid
     ) then
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
  'A metade da deduplicacao de cliente que um indice nao consegue expressar: cliente que NASCE nesta aplicacao nao pode repetir o documento, a chave nem o TELEFONE de um cliente IMPORTADO do base44, embora dois importados possam se repetir entre si (0065 para documento e chave, 0076 para telefone). Duas linhas sao dispensadas da conferencia de telefone pelo id, pelo motivo escrito no cabecalho da 0076 - sem a dispensa elas ficariam ineditaveis. Levanta 23505 com o nome do indice na mensagem, exatamente como o indice levantaria, para que a tela de CRM continue traduzindo o erro e mostrando quem ocupa o valor sem nenhuma mudanca no frontend. AFTER, e nao BEFORE: tax_id_digits, client_key e phone_digits sao colunas GERADAS, e o Postgres so as calcula depois dos triggers BEFORE - em BEFORE elas chegariam nulas e a conferencia nao conferiria nada. SECURITY DEFINER para que a garantia de unicidade nao dependa de a policy de SELECT de clients continuar larga: a consulta e restrita a new.tenant_id, que a propria policy de escrita ja obriga a ser o do usuario.';

-- O trigger precisa passar a acordar quando `phone` muda. Trigger nao tem
-- `create or replace`.
drop trigger clients_reject_key_collision on public.clients;

create trigger clients_reject_key_collision
  after insert or update of tenant_id, tax_id, email, phone, legacy_id on public.clients
  for each row execute function public.clients_reject_key_collision();
