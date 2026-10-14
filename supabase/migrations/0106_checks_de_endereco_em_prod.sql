-- Os dois checks de endereco da 0064 que nao existiam em producao.
--
-- O QUE FALTAVA
--   A 0064 trocou NOT NULL por `check (<coluna> is not null or legacy_id is not
--   null)` em seis colunas. Em producao quatro desses checks estao no lugar; os
--   dois de `clients` — `address_city` e `address_state` — nao foram criados,
--   embora o NOT NULL tenha sido retirado das duas colunas. O resultado e um
--   banco mais FROUXO que o projetado: cliente novo, digitado na tela, era
--   aceito sem cidade e sem UF.
--
--   Dev tem os seis. A deriva apareceu na suite `crm-schema` rodada contra
--   producao (caso 7.10, "CONTROLE: cliente sem cidade e sem legacy_id e
--   recusado", que passou a observar OK onde esperava 23514).
--
-- POR QUE E SEGURO AGORA
--   Em producao ha 1 cliente sem cidade, e ele tem `legacy_id` — e linha
--   importada do base44, que e exatamente o caso que o check libera. Contagem
--   antes de aplicar: 0 linhas com cidade nula e legacy_id nulo, 0 com UF nula e
--   legacy_id nulo. Nenhuma linha existente passa a ser invalida.
--
-- POR QUE O `do` EM VOLTA
--   Em dev os dois checks existem desde a 0064. `add constraint` nao tem
--   `if not exists`, e repetir daria 42710 e abortaria a migration. O bloco
--   deixa esta migration rodar nos dois bancos com o mesmo arquivo — nos dois,
--   o estado final e o mesmo.

do $BODY$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_address_city_required_check') then
    alter table public.clients
      add constraint clients_address_city_required_check
      check (address_city is not null or legacy_id is not null);

    comment on constraint clients_address_city_required_check on public.clients is
      'Cidade da residencia e obrigatoria para quem e cadastrado pela tela; nula so em linha importada do base44. Ver o cabecalho da 0064.';
  end if;

  if not exists (select 1 from pg_constraint where conname = 'clients_address_state_required_check') then
    alter table public.clients
      add constraint clients_address_state_required_check
      check (address_state is not null or legacy_id is not null);

    comment on constraint clients_address_state_required_check on public.clients is
      'Gemea de clients_address_city_required_check, pelo mesmo motivo e para o mesmo cliente. Ver o cabecalho da 0064.';
  end if;
end
$BODY$;
