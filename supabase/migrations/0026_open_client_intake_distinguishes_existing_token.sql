-- A abertura do formulario publico distingue os estados de um token QUE EXISTE.
--
-- POR QUE MUDA
--   O plano do modulo 3 (docs/SCHEMA-PLAN.md) exigia que token inexistente,
--   expirado e ja enviado devolvessem recusas indistinguiveis, para o endpoint
--   nao virar oraculo de "este token existe?". A 0025 implementou exatamente
--   isso: zero linhas nos tres casos.
--
--   A exigencia estava mais rigida do que o risco justifica, e o usuario
--   decidiu revisa-la. O raciocinio:
--
--   O que a indistinguibilidade protege e a descoberta de tokens validos por
--   tentativa. O token e uuid v4 gerado pelo banco - 122 bits de aleatoriedade.
--   Adivinhar um exige da ordem de 2^61 tentativas para 50% de chance, com
--   limite de requisicao na frente. Ou seja: a protecao cobre um ataque que ja
--   e inviavel por outro motivo.
--
--   O custo era real e recaia sobre quem tem o link legitimamente. O cliente que
--   preencheu e reabre o proprio link - para conferir, ou porque clicou de novo
--   na mensagem - via a mesma recusa seca de quem digitou um endereco errado.
--   No original ele veria "Dados Enviados com Sucesso". A pessoa que ve erro
--   onde deveria ver confirmacao liga para o escritorio perguntando se deu
--   certo.
--
--   Trocar usabilidade certa por protecao teorica e mau negocio. O que continua
--   protegido e o que importa: token inexistente NAO se distingue de token
--   invalido, e nenhum estado revela dado do briefing nem id interno.
--
-- O QUE CONTINUA IGUAL
--   - Nenhum id, tenant_id, client_id ou negotiation_id sai daqui.
--   - Expiracao continua decidida no servidor, e a linha continua sendo marcada
--     como expirada na abertura.
--   - A funcao continua sem EXECUTE para anon e authenticated: so service_role,
--     pela edge function.
--   - Campo ja preenchido do briefing continua nao saindo: o formulario nasce
--     em branco, como no original.

create type public.client_intake_outcome as enum (
  'active',            -- token valido: o formulario abre
  'expired',           -- existiu, venceu
  'already_submitted', -- existiu, ja foi enviado
  'not_found'          -- nao existe, OU e invalido: os dois sao a mesma coisa aqui
);

comment on type public.client_intake_outcome is
  'Desfecho da abertura do formulario publico. "not_found" cobre token inexistente E token invalido de proposito - e a unica indistinguibilidade que sobrou, e a unica que protege algo. Os outros tres descrevem um token que existe, e quem tem um token que existe o recebeu do escritorio.';

drop function if exists public.open_client_intake(uuid);

create or replace function public.open_client_intake(p_token uuid)
returns table (
  outcome public.client_intake_outcome,
  client_name text,
  expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status public.client_intake_status;
  v_expires timestamptz;
  v_name text;
begin
  -- FOR UPDATE porque a linha pode ser marcada como expirada logo abaixo, e
  -- porque a abertura pode correr junto com um envio.
  select ci.id, ci.status, ci.expires_at, c.name
    into v_id, v_status, v_expires, v_name
    from public.client_intakes ci
    join public.clients c
      on c.id = ci.client_id
     and c.tenant_id = ci.tenant_id
   where ci.token = p_token
     for update of ci;

  if v_id is null then
    return query select 'not_found'::public.client_intake_outcome, null::text, null::timestamptz;
    return;
  end if;

  -- Expiracao decidida aqui, no servidor. No original quem compara a data e o
  -- navegador (FormularioCliente.jsx:70), e navegador nao e autoridade: relogio
  -- atrasado, ou requisicao montada a mao, reabrem um link vencido.
  if v_status = 'active' and v_expires <= now() then
    update public.client_intakes
       set status = 'expired',
           last_access_at = now(),
           last_validation_status = 'expired'
     where id = v_id;

    return query select 'expired'::public.client_intake_outcome, v_name, v_expires;
    return;
  end if;

  update public.client_intakes
     set last_access_at = now(),
         last_validation_status = case v_status
                                    when 'submitted' then 'already_submitted'::public.client_intake_validation_status
                                    when 'expired'   then 'expired'::public.client_intake_validation_status
                                    else 'ok'::public.client_intake_validation_status
                                  end
   where id = v_id;

  return query
    select case v_status
             when 'submitted' then 'already_submitted'::public.client_intake_outcome
             when 'expired'   then 'expired'::public.client_intake_outcome
             else 'active'::public.client_intake_outcome
           end,
           v_name,
           v_expires;
end;
$$;

comment on function public.open_client_intake(uuid) is
  'Resolve o token do formulario publico e devolve o desfecho, o nome do cliente e o fim da validade - nada mais. Sempre UMA linha: "not_found" para token inexistente ou invalido (os dois indistinguiveis de proposito), e os outros tres descrevendo um token que existe. A distincao entre expirado e ja enviado existe porque quem tem um token que existe o recebeu do escritorio, e ver "seus dados ja foram enviados" em vez de uma recusa seca e o comportamento do original - ver o cabecalho da migration 0026 para o raciocinio completo. O que NAO sai daqui, por desenho da assinatura: id, tenant_id, client_id, negotiation_id e todos os campos do briefing. Marca a linha como expirada quando o prazo venceu e registra a tentativa; nada disso muda a resposta.';

revoke all on function public.open_client_intake(uuid) from public, anon, authenticated;
grant execute on function public.open_client_intake(uuid) to service_role;
