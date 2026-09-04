-- Busca global: uma pergunta, sete entidades.
--
-- O QUE EXISTIA
--   Nada. O botao de lupa do cabecalho abre um dialogo com um `input` solto —
--   sem estado, sem consulta, sem resultado. O ORIGINAL E IGUAL
--   (QuickActions.jsx:250-258 do base44): o campo nunca foi ligado a coisa
--   alguma. Entao "corrigir a busca" e construi-la; nao ha comportamento a
--   portar, e por isso as decisoes abaixo sao novas.
--
-- POR QUE UMA FUNCAO, E NAO SETE CONSULTAS NO NAVEGADOR
--   Sete consultas paralelas dariam sete listas, cada uma com seu proprio
--   estado de carregamento, e a ordenacao entre tipos teria de ser refeita no
--   cliente a cada tecla. Uma funcao devolve UMA lista, ja ordenada e limitada.
--
-- SECURITY INVOKER — E ESTA E A DECISAO QUE MAIS IMPORTA
--   A funcao NAO e `security definer`. Ela roda com os privilegios de quem
--   chama, entao cada SELECT dentro dela passa pela RLS da tabela: a busca
--   devolve exatamente o que aquela pessoa veria abrindo a tela, nem uma linha
--   a mais. Uma busca `security definer` seria a porta dos fundos de todo o
--   sistema de permissoes — e ninguem notaria, porque o resultado "funciona".
--
--   Consequencia visivel e correta: um Arquiteto sem o menu Atividades nao
--   acha atividade dos outros aqui, do mesmo jeito que nao acha na tela.
--
-- O BANCO NAO SABE DE ROTA
--   O retorno traz `tipo` e `id`, nunca uma URL. Para onde cada tipo leva e
--   decisao de tela, muda quando a navegacao muda, e nao tem por que estar
--   gravado numa funcao de banco.

create or replace function public.search_platform(p_term text)
returns table (
  tipo text,
  id uuid,
  titulo text,
  subtitulo text,
  detalhe text,
  ordem int
)
language sql
stable
security invoker
set search_path = ''
as $BODY$
  with termo as (
    /*
      O QUE A PESSOA DIGITOU E TEXTO A PROCURAR, NAO INSTRUCAO DE BUSCA.
      `%`, `_` e `\` sao curingas do LIKE: sem escapar, digitar "%" listaria o
      escritorio inteiro. Mesmo tratamento que `escapeLikePattern` ja faz na
      listagem de clientes.
    */
    select '%' || replace(replace(replace(btrim(p_term), '\', '\\'), '%', '\%'), '_', '\_') || '%' as padrao,
           btrim(p_term) as cru
  )
  select * from (
    -- CLIENTES ------------------------------------------------------------
    -- `search_text` ja cobre nome, e-mail, telefone, documento nas duas formas
    -- e cidade (0020/0089), e tem indice de trigrama. Reaproveitar e melhor que
    -- inventar um segundo criterio de "achar cliente".
    select 'cliente' as tipo, c.id, c.name as titulo,
           coalesce(c.address_city, '') as subtitulo,
           coalesce(c.phone, '') as detalhe,
           1 as ordem
    from public.clients c, termo t
    where c.search_text ilike t.padrao
    limit 8
  ) x
  union all select * from (
    -- PROJETOS ------------------------------------------------------------
    select 'projeto', p.id, p.name,
           coalesce(cl.name, ''),
           coalesce(p.city, ''),
           2
    from public.projects p
    left join public.clients cl on cl.id = p.client_id
    , termo t
    where p.name ilike t.padrao
       or coalesce(cl.name, '') ilike t.padrao
       or coalesce(p.subdivision_name, '') ilike t.padrao
    limit 8
  ) x
  union all select * from (
    /*
      CONTRATOS E PROPOSTAS SAO A MESMA TABELA, e o tipo sai do STATUS: no
      modulo 4 "proposta" e contrato ainda em negociacao. Separa-los aqui e o
      que faz a lista de resultados falar a lingua da tela, onde as abas sao
      "Em negociacao" e "Aprovados".
    */
    select case when co.status = 'negotiating' then 'proposta' else 'contrato' end,
           co.id, co.contract_number,
           coalesce(co.project_name, coalesce(cl.name, '')),
           coalesce(cl.name, ''),
           3
    from public.contracts co
    left join public.clients cl on cl.id = co.client_id
    , termo t
    where co.contract_number ilike t.padrao
       or coalesce(co.project_name, '') ilike t.padrao
       or coalesce(co.client_legal_name, '') ilike t.padrao
       or coalesce(cl.name, '') ilike t.padrao
    limit 8
  ) x
  union all select * from (
    -- NEGOCIACOES (Pipeline) ----------------------------------------------
    select 'negociacao', n.id, n.name,
           coalesce(cl.name, ''),
           '',
           4
    from public.negotiations n
    left join public.clients cl on cl.id = n.client_id
    , termo t
    where n.name ilike t.padrao
       or coalesce(cl.name, '') ilike t.padrao
    limit 8
  ) x
  union all select * from (
    -- TAREFAS (Fluxo do Projeto) ------------------------------------------
    select 'tarefa', tk.id, tk.title,
           coalesce(p.name, ''),
           '',
           5
    from public.tasks tk
    left join public.projects p on p.id = tk.project_id
    , termo t
    where tk.title ilike t.padrao
       or coalesce(tk.description, '') ilike t.padrao
       or coalesce(p.name, '') ilike t.padrao
    limit 8
  ) x
  union all select * from (
    /*
      ATIVIDADES nao tem titulo — `description` E o texto da atividade
      (migration 0037). O `deleted_at is null` acompanha a listagem: atividade
      excluida continua legivel para quem administra, e nao tem por que
      aparecer numa busca.
    */
    select 'atividade', a.id, a.description,
           coalesce(p.name, ''),
           coalesce(col.name, ''),
           6
    from public.activities a
    left join public.projects p on p.id = a.project_id
    left join public.collaborators col on col.id = a.collaborator_id
    , termo t
    where a.deleted_at is null
      and (a.description ilike t.padrao or coalesce(p.name, '') ilike t.padrao)
    limit 8
  ) x
  union all select * from (
    -- FORNECEDORES ---------------------------------------------------------
    select 'fornecedor', s.id, s.name,
           coalesce(s.city, ''),
           coalesce(s.contact_name, ''),
           7
    from public.suppliers s, termo t
    where s.name ilike t.padrao
       or coalesce(s.contact_name, '') ilike t.padrao
       or coalesce(s.city, '') ilike t.padrao
    limit 8
  ) x
$BODY$;

comment on function public.search_platform(text) is
  'Busca global: procura o termo em clientes, projetos, contratos, propostas, negociacoes, tarefas, atividades e fornecedores, e devolve linhas normalizadas (tipo, id, titulo, subtitulo, detalhe). SECURITY INVOKER de proposito - cada SELECT passa pela RLS da sua tabela, entao a busca devolve exatamente o que quem pergunta veria abrindo a tela. Nao devolve URL: para onde cada tipo leva e decisao de tela. Oito resultados por tipo.';

/*
  `authenticated` e so. `anon` nao chama: a unica superficie sem sessao do
  sistema e o formulario publico de briefing, que nao busca nada.
*/
revoke all on function public.search_platform(text) from public, anon;
grant execute on function public.search_platform(text) to authenticated;
