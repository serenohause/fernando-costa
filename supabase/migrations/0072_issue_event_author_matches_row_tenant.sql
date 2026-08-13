-- Modulo 11 - o autor do evento de historico so e gravado quando a sessao
-- pertence AO MESMO escritorio da pendencia.
--
-- O DEFEITO, E QUEM O ENCONTROU
--   project_issues_log_event (0069) montava a linha do historico com o tenant
--   vindo da PENDENCIA (new.tenant_id) e o autor vindo do JWT
--   (auth_collaborator_id()). Os dois quase sempre concordam, e quando nao
--   concordam a FK composta author_id + tenant_id explode com 23503 - um erro
--   que nao tem nada a ver com o que a pessoa fez e que a tela nao tem como
--   explicar.
--
--   Quem achou foi a suite de invariantes, na primeira execucao com as cinco
--   tabelas do modulo: ela grava as fixtures como postgres logo depois de sondar
--   uma policy, e request.jwt.claims continua valendo depois da sonda. Resultado:
--   a pendencia do escritorio B nasceu com o claim do colaborador do escritorio
--   A pendurado na sessao, e o INSERT do historico morreu.
--
--   Nao e artefato de teste. O mesmo estado acontece em producao sempre que uma
--   escrita passa por cima da RLS com um claim de outro escritorio na sessao:
--   service_role, script de importacao, correcao no painel. E ali o efeito e
--   pior, porque o que falha nao e a linha do historico - e a escrita inteira,
--   que o trigger derruba junto.
--
-- O CONSERTO
--   author_id so recebe valor quando auth_tenant_id() = new.tenant_id. Fora
--   disso vai NULO, que e o que a coluna ja significa: "nao ha sessao
--   identificavel por tras deste evento" (ver o COMMENT da coluna na 0069).
--   Inventar autor num historico e pior do que nao ter autor; derrubar a escrita
--   por causa do autor e pior ainda.
--
--   Nada mais muda: tipo de evento, transicao de status e o momento continuam
--   iguais, e nenhuma linha ja gravada e tocada.

create or replace function public.project_issues_log_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.project_issue_event_type;
  v_from public.project_issue_status;
  v_to public.project_issue_status;
  v_author uuid;
begin
  if tg_op = 'INSERT' then
    v_type := 'created';
    v_to := new.status;
  elsif new.status is distinct from old.status then
    v_from := old.status;
    v_to := new.status;
    v_type := case
                when new.status = 'resolved' then 'resolved'
                when new.status = 'cancelled' then 'cancelled'
                when old.status in ('resolved', 'cancelled') then 'reopened'
                else 'status_changed'
              end;
  else
    v_type := 'updated';
  end if;

  -- O autor so vale se a sessao for do MESMO escritorio da pendencia. A FK de
  -- author_id e composta com tenant_id, e um claim de outro escritorio pendurado
  -- na sessao derrubaria a escrita inteira com 23503.
  if public.auth_tenant_id() = new.tenant_id then
    v_author := public.auth_collaborator_id();
  end if;

  insert into public.project_issue_events
    (tenant_id, issue_id, event_type, from_status, to_status, author_id)
  values
    (new.tenant_id, new.id, v_type, v_from, v_to, v_author);

  return null;
end;
$$;

comment on function public.project_issues_log_event() is
  'Escreve uma linha em project_issue_events a cada INSERT ou UPDATE de pendencia. Substitui o read-modify-write do array historico feito no navegador (defeito 12 do plano). Distingue resolved, cancelled e reopened pela transicao de status - reopened nao existe no original, que so registra tres frases e nunca a de reabertura. AFTER e nao BEFORE porque o evento descreve o que ja foi gravado. SECURITY DEFINER porque o historico nao pode depender da policy de escrita da tabela filha; o tenant vem da linha, nao do JWT. O AUTOR so e gravado quando a sessao pertence ao mesmo escritorio da pendencia (0072): a FK de author_id e composta com tenant_id, e um claim de outro escritorio na sessao derrubaria a escrita inteira com 23503 em vez de apenas nao saber quem foi.';
