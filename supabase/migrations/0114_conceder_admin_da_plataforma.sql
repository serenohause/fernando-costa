-- Conceder e retirar o acesso a fila de leads, sem tela e sem senha de banco.
--
-- POR QUE ESTE ARQUIVO EXISTE
--   A 0112 diz que linha em platform_admins "entra por migration ou pelo painel
--   da Supabase, de proposito: nao existe tela que conceda este acesso". A
--   intencao continua inteira, e esta migration nao a afrouxa: ela nao cria
--   tela nenhuma. O que ela cria e o caminho de OPERADOR, para o script
--   scripts/criar-admin-plataforma.mjs poder fazer o que hoje exige abrir o
--   painel e digitar SQL a mao.
--
--   E preciso porque service_role NAO tem privilegio de leitura nem de escrita
--   em platform_admins - nem nela, nem em product_leads, nem em tabela nova
--   nenhuma deste projeto. Nao e esquecimento da 0112: e o padrao novo do
--   Supabase, registrado em supabase/config.toml ("new entities are NOT
--   auto-exposed, matching the new cloud default"). Medido: PostgREST com a
--   chave de servico devolve 42501 em platform_admins, product_leads e
--   collaborators.
--
--   Ou seja, o unico caminho que sobra para quem tem a chave de servico e uma
--   funcao security definer - que e exatamente o que a 0013
--   (approve_access_request) e a 0112 (capture_product_lead) ja fazem para a
--   escrita que a RLS nao pode decidir.
--
-- ISTO MUDA A POSTURA? MUDA UM POUCO, E VALE DIZER QUAL
--   Antes, conceder o acesso exigia o painel da Supabase (ou seja, a senha do
--   banco). Agora exige a CHAVE DE SERVICO. Os dois sao segredo de operador, e
--   quem tem a chave de servico ja pode chamar qualquer funcao security definer
--   deste banco - inclusive as que criam login de colaborador. Nao ha
--   privilegio novo no mundo; ha um atalho a menos de digitacao manual, que e
--   onde erro de operacao nasce.
--
--   O que NAO muda, e e o que importa: `anon` e `authenticated` continuam sem
--   EXECUTE. Nenhuma sessao de navegador, de nenhum escritorio, alcanca estas
--   duas funcoes. Quem esta logado no sistema nao pode se promover, nem promover
--   outro, nem descobrir quem esta na lista.
--
-- RETIRAR TEM DE SER TAO FACIL QUANTO CONCEDER
--   As duas funcoes nascem juntas de proposito. Acesso que se concede por
--   comando e se retira so a mao e acesso que fica esquecido ligado.

-- 1. Conceder -------------------------------------------------------------------

create or replace function public.grant_platform_admin(
  p_user_id uuid,
  p_note text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  /*
    Usuario inexistente levanta erro em vez de gravar. A FK ja recusaria, mas
    com mensagem de constraint; aqui a recusa diz o que a pessoa precisa saber,
    que e "esse login nao existe neste banco" - o engano mais provavel sendo
    rodar o comando apontando para o ambiente errado.
  */
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'grant_platform_admin: nao existe usuario % em auth.users deste banco', p_user_id
      using errcode = '22023';
  end if;

  insert into public.platform_admins as pa (user_id, note)
  values (p_user_id, nullif(btrim(p_note), ''))
  on conflict (user_id) do update
     -- Rodar de novo nao apaga a anotacao de quem a tinha.
     set note = coalesce(excluded.note, pa.note);

  return true;
end;
$$;

comment on function public.grant_platform_admin(uuid, text) is
  'Poe um usuario em public.platform_admins, que e a unica coisa que a policy product_leads_select_platform olha. E o caminho de OPERADOR (scripts/criar-admin-plataforma.mjs), nao de tela: anon e authenticated nao tem EXECUTE, entao nenhuma sessao de navegador alcanca esta funcao e ninguem logado no sistema pode se promover nem promover outro. Existe porque service_role nao tem privilegio em platform_admins - padrao novo do Supabase, tabela nova nao e auto-exposta - e portanto PostgREST devolve 42501. Usuario inexistente levanta 22023, para o engano de apontar para o ambiente errado aparecer como erro e nao como sucesso silencioso. Rodar duas vezes e inofensivo e nao apaga a anotacao existente.';

revoke all on function public.grant_platform_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.grant_platform_admin(uuid, text) to service_role;

-- 2. Retirar --------------------------------------------------------------------

create or replace function public.revoke_platform_admin(p_user_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_apagadas int;
begin
  delete from public.platform_admins where user_id = p_user_id;
  get diagnostics v_apagadas = row_count;

  /*
    Devolve se havia o que retirar, e nao levanta erro quando nao havia: o
    desfecho desejado de "esta pessoa nao le a fila" e o mesmo nos dois casos, e
    quem chama precisa saber a diferenca sem ter de tratar excecao.
  */
  return v_apagadas > 0;
end;
$$;

comment on function public.revoke_platform_admin(uuid) is
  'Tira um usuario de public.platform_admins, e com isso o acesso a fila de leads na hora - a policy deixa de casar linha. O login continua existindo. Nasceu junto de grant_platform_admin de proposito: acesso que se concede por comando e se retira so a mao e acesso que fica esquecido ligado. Devolve false quando a pessoa ja nao estava na lista, em vez de levantar erro; o desfecho e o mesmo e quem chama nao precisa tratar excecao para saber disso.';

revoke all on function public.revoke_platform_admin(uuid) from public, anon, authenticated;
grant execute on function public.revoke_platform_admin(uuid) to service_role;
