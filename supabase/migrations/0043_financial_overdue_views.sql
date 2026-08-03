-- Modulo 7 (Financeiro) - "Em atraso" e generated_count, calculados.
--
-- A DECISAO QUE O PLANO DEIXOU EM ABERTO
--   docs/SCHEMA-PLAN.md, secao "Em atraso - o plano estava impreciso", diz:
--   coluna gerada nao pode usar current_date, que nao e imutavel, entao e VIEW
--   ou calculo na consulta - "decidir na implementacao".
--
--   Decidido: VIEW, com a regra dentro de uma FUNCAO. Tres motivos, em ordem
--   de peso.
--
--   1. Calculo na consulta significa a mesma expressao repetida na listagem de
--      recebiveis, na de pagamentos, no cartao de resumo, no filtro "Em atraso",
--      no PDF exportado e nos paineis do modulo 10. E exatamente a forma de
--      erro que este projeto ja removeu tres vezes - deduplicacao do CRM (0015),
--      progresso do projeto (0034) e tempo total de atividade (0037): regra
--      derivada escrita em varios lugares so esta certa enquanto todos forem
--      editados juntos.
--
--   2. generated_count nao tem como ser calculo na consulta sem um agregado.
--      Como ele tambem e derivado e tambem precisa existir, a view ja e
--      necessaria - e uma view so, com as duas coisas, e menos superficie do que
--      uma view para uma e expressao solta para a outra.
--
--   3. Ja existe precedente aplicado e testado no projeto: project_progress
--      (0034/0035), view SECURITY INVOKER lida pelo modulo 10.
--
--   A funcao existe ao lado da view porque a regra tambem precisa ser usada em
--   WHERE por quem filtra "Em atraso" sem passar pela view, e porque uma
--   definicao unica e o que faz a view e o filtro nunca discordarem.
--
-- DIVERGENCIA CONHECIDA EM RELACAO AO ORIGINAL - PRECISA DE DECISAO DO USUARIO
--   O original calcula `status !== 'Pago' && due_date < hoje`
--   (AccountsReceivable.jsx:228 e AccountsPayable.jsx:551). Ou seja, la o
--   status "Negociado" TAMBEM aparece em atraso.
--
--   docs/SCHEMA-PLAN.md e docs/ENUM-MAP.md definem, os dois, `status =
--   'forecast' and due_date < current_date` - o que deixa renegotiated de fora.
--   Esta migration segue o plano aprovado, e a divergencia fica registrada aqui
--   em vez de ser resolvida em silencio: parcela renegociada e vencida vai
--   aparecer como "Negociado" e nao como "Em atraso", e isso muda o total do
--   cartao de inadimplencia em relacao ao sistema atual. Se a decisao for
--   voltar ao comportamento do original, o unico lugar a mexer e a funcao
--   abaixo (e uma migration nova, nao a edicao desta).
--
--   Diferenca menor, e essa e correcao: o original compara
--   `new Date('YYYY-MM-DD') < new Date()`, que interpreta o vencimento como
--   meia-noite UTC. Em Brasilia isso faz a conta vencida "hoje" virar atraso as
--   21h do dia ANTERIOR. Aqui a comparacao e entre datas, e vencimento de hoje
--   nao esta em atraso.

create or replace function public.is_financial_overdue(
  p_status public.financial_status,
  p_due_date date
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status = 'forecast' and p_due_date < current_date;
$$;

comment on function public.is_financial_overdue(public.financial_status, date) is
  'A regra de "Em atraso" do financeiro, em um lugar so: previsto e vencido. Nao e coluna gerada porque current_date nao e imutavel, e nao e coluna gravada porque isso exigiria um job diario que, no dia em que falhasse, faria o banco mentir sobre a inadimplencia (convencao registrada na migration 0001, ponto 3). STABLE, e nao IMMUTABLE: o resultado muda quando o dia vira. Serve as views accounts_receivable_status / accounts_payable_status e o filtro "Em atraso" das telas. DIVERGE do original ao deixar renegotiated de fora - ver o cabecalho da migration 0043.';

revoke all on function public.is_financial_overdue(public.financial_status, date) from public, anon;
grant execute on function public.is_financial_overdue(public.financial_status, date) to authenticated, service_role;

-- As views --------------------------------------------------------------------
--
-- SECURITY INVOKER: as policies da 0042 valem para quem consulta. Sem isso a
-- view rodaria como o dono (postgres, que nao sofre RLS) e devolveria a carteira
-- de todos os escritorios para qualquer um com SELECT nela.

create view public.accounts_receivable_status
with (security_invoker = true) as
select
  r.*,
  public.is_financial_overdue(r.status, r.due_date) as is_overdue
from public.accounts_receivable r;

comment on view public.accounts_receivable_status is
  'accounts_receivable mais a coluna calculada is_overdue. E daqui que as telas de recebiveis leem, e nao da tabela: assim o "Em atraso" que a lista mostra, o que o filtro usa e o que o painel do modulo 10 soma sao literalmente o mesmo calculo. SECURITY INVOKER - a RLS da tabela vale para quem consulta.';

comment on column public.accounts_receivable_status.is_overdue is
  'Previsto e vencido. Falso para parcela paga com vencimento no passado, que e o caso que separa "atrasou" de "atrasou e continua em aberto".';

create view public.accounts_payable_status
with (security_invoker = true) as
select
  p.*,
  public.is_financial_overdue(p.status, p.due_date) as is_overdue,
  (
    select count(*)
    from public.accounts_payable c
    where c.recurrence_parent_id = p.id
      and c.tenant_id = p.tenant_id
  )::int as generated_count
from public.accounts_payable p;

comment on view public.accounts_payable_status is
  'accounts_payable mais duas colunas calculadas: is_overdue e generated_count. E daqui que as telas de pagamentos leem. SECURITY INVOKER - a RLS da tabela vale para quem consulta, inclusive dentro da subconsulta que conta as ocorrencias.';

comment on column public.accounts_payable_status.generated_count is
  'Quantas ocorrencias ja foram geradas a partir desta linha-mae. DERIVADO: conta os filhos, nao le contador. No original e uma coluna que a aplicacao incrementa depois do bulkCreate (AccountsPayable.jsx:212) e que ninguem decrementa quando uma ocorrencia e apagada pela tela - a partir da primeira exclusao o numero mente, e nada acusa. Zero para despesa avulsa e para ocorrencia (que nao gera ninguem), nunca nulo.';

-- anon NAO recebe nada: nenhuma tela do financeiro e publica.
grant select on public.accounts_receivable_status to authenticated;
grant select on public.accounts_payable_status to authenticated;
