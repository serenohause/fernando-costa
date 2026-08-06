-- Quatro checks de coerencia e um de dominio passam a abrir excecao para linha
-- importada do base44. Mesma regra da 0062: `check (X or legacy_id is not null)`.
--
-- POR QUE ESTA MIGRATION E SEPARADA DA 0062
--   A 0062 e um caso so, repetido em quatro tabelas ("aconteceu, e o quando nao
--   foi registrado"). Aqui sao cinco regras diferentes, cada uma com o seu
--   motivo. Juntar as duas coisas faria o cabecalho de uma esconder o da outra.
--
-- OS CINCO CASOS, UM A UM
--
--   1. accounts_receivable: 4 parcelas com valor ZERO. O check e `> 0` de
--      proposito - parcela de zero real nao e cobranca e entra na soma da
--      carteira como se fosse. Mas o escritorio lancou quatro assim no base44
--      (parcela unica de contrato, "Parcela 1/1"), e recusa-las apagaria quatro
--      contratos da conciliacao. A EXCECAO E MAIS ESTREITA que a das outras
--      quatro regras desta migration: linha importada aceita `>= 0`, e nao
--      "qualquer coisa". Dinheiro NEGATIVO continua impossivel em toda linha,
--      importada ou nao, porque o export nao tem nenhum negativo e porque a
--      excecao acompanha a linha para sempre - com `or legacy_id is not null`
--      puro, uma parcela importada poderia ser editada pela tela para -100 e o
--      banco aceitaria.
--
--   2. accounts_payable: 2 despesas marcadas como recorrentes sem
--      recurrence_frequency (as duas tem data de inicio; falta a frequencia).
--      O check existe porque o original chuta o que falta - assume mensal
--      quando a frequencia nao bate com o mapa (AccountsPayable.jsx:171) - e
--      chute vira lancamento financeiro em data que ninguem pediu. A recorrencia
--      declarada e um FATO do dado: a linha diz "isto se repete". Recusa-la
--      perderia tambem a despesa, e com uma delas caiam 3 ocorrencias que so
--      apontavam para a mae. Importada, a recorrencia entra incompleta e NAO
--      gera nada sozinha: quem gera ocorrencia e a tela, e ela pede os campos.
--
--   3. activities: 1 atividade excluida com data de exclusao e sem autor. O par
--      deleted_at/deleted_by anda junto para que exclusao logica sempre tenha
--      quem responda por ela. No base44 sao quatro campos sem amarracao nenhuma,
--      e essa linha ficou com metade. As saidas eram recusar a atividade,
--      inventar um autor, ou aceitar a metade. Inventar autor de exclusao e
--      pior que nao ter: e atribuir a alguem um ato que ele pode nao ter
--      praticado. Nulificar tambem o deleted_at seria "desapagar" a atividade,
--      que e mudar o fato.
--
--   4. negotiations: 1 negociacao com motivo/observacao de perda e status que
--      nao e Perdida. O check vale nos dois sentidos (gravar perda em
--      negociacao ativa, e voltar uma perdida para ativa sem limpar o motivo
--      sao a mesma violacao). O original nao impede, e o card do kanban exibe o
--      motivo - ou seja, o estado invalido chegava ate a tela. Limpar o motivo
--      na importacao apagaria texto que alguem escreveu sobre por que o negocio
--      nao andou; mudar o status para "Perdida" inventaria um desfecho.
--
--   5. suppliers: 1 fornecedor com tipologia "Revestimento de Fachada"
--      (facade_cladding, +2 marcas que caiam por cascata). O enum
--      supplier_category e compartilhado com budget_checklist_items, e o check
--      devolve a suppliers o dominio que o formulario do original oferece. A
--      tipologia e REAL e conhecida: virar 'other' apagaria um fato que o
--      escritorio registrou. Nao e o mesmo caso do fornecedor com tipologia
--      VAZIA, que entrou como 'other' - la nao ha fato a apagar, 'other' e o
--      valor que a propria lista do base44 oferece para "sem classificacao", e
--      ele nao afirma categoria nenhuma.
--
-- AUDITORIA
--   Cada excecao e listavel. Exemplo do caso 5:
--     select id, name, category from public.suppliers
--      where legacy_id is not null
--        and category::text = any (array['facade_cladding', 'pool_cladding',
--                                        'waterproofing', 'drywall_plaster']);
--
-- POR QUE MIGRATION NOVA
--   A 0022, a 0037, a 0041 e a 0049 ja estao aplicadas. Migration aplicada nao
--   se edita (docs/ARCHITECTURE.md).

-- 1. accounts_receivable: valor zero -------------------------------------------

alter table public.accounts_receivable
  drop constraint accounts_receivable_value_positive_check;

alter table public.accounts_receivable
  add constraint accounts_receivable_value_positive_check
  check (value > 0 or (legacy_id is not null and value >= 0));

comment on constraint accounts_receivable_value_positive_check on public.accounts_receivable is
  'Dinheiro > 0, e nao >= 0: parcela de zero real nao e cobranca e entra na soma da carteira como se fosse. A EXCECAO EXISTE POR CAUSA DA IMPORTACAO e some quando legacy_id e nulo: 4 parcelas do base44 foram lancadas com valor zero. A excecao e ESTREITA de proposito - a linha importada aceita zero, nunca negativo, porque a excecao acompanha a linha para sempre e a tela continua podendo editar essa linha. Ver o cabecalho da 0063.';

comment on column public.accounts_receivable.value is
  'Valor da parcela em reais. numeric(14,2), nunca float: dinheiro somado em ponto flutuante desloca centavo no total da carteira. A soma das parcelas geradas de um contrato e EXATAMENTE contracts.total_value - a divisao acontece em centavos inteiros e o resto vai na primeira parcela (ver 0044). Zero so e aceito em linha importada do base44 (0063); negativo nunca.';

-- 2. accounts_payable: recorrencia sem plano -----------------------------------

alter table public.accounts_payable
  drop constraint accounts_payable_recurrence_plan_check;

alter table public.accounts_payable
  add constraint accounts_payable_recurrence_plan_check
  check (
    is_recurring = false
    or (recurrence_frequency is not null and recurrence_start_date is not null)
    or legacy_id is not null
  );

comment on constraint accounts_payable_recurrence_plan_check on public.accounts_payable is
  'Recorrencia declarada precisa dizer com que frequencia e a partir de quando. O original nao exige: quando recurrence_start_date falta ele usa due_date (AccountsPayable.jsx:152) e quando a frequencia nao bate com o mapa ele assume mensal (:171). Sao dois palpites que geram lancamento financeiro em data que ninguem pediu, e ninguem descobre ate a conta vencer. A EXCECAO EXISTE POR CAUSA DA IMPORTACAO e some quando legacy_id e nulo: 2 despesas do base44 se declaram recorrentes sem frequencia. Elas nao geram ocorrencia sozinhas - quem gera e a tela, e a tela pede os campos. Ver o cabecalho da 0063.';

-- 3. activities: exclusao logica pela metade ------------------------------------

alter table public.activities
  drop constraint activities_deleted_pair_check;

alter table public.activities
  add constraint activities_deleted_pair_check
  check (((deleted_at is null) = (deleted_by is null)) or legacy_id is not null);

comment on constraint activities_deleted_pair_check on public.activities is
  'deleted_at e deleted_by andam juntos. O original tem quatro campos para isto e nenhuma amarracao: bandeira levantada sem data nao diz quando, e autor sem bandeira e linha viva com dono de exclusao. Nulo/nulo e o estado normal. A EXCECAO EXISTE POR CAUSA DA IMPORTACAO e some quando legacy_id e nulo: 1 atividade do base44 foi excluida sem que o autor tenha ficado registrado. Inventar o autor seria atribuir a alguem um ato que pode nao ter praticado; nulificar a data seria desapagar a atividade. Ver o cabecalho da 0063.';

comment on column public.activities.deleted_by is
  'Quem excluiu a atividade. FK composta para collaborators. Amarrada a deleted_at por check, para tudo que nasce nesta aplicacao. Nula COM deleted_at preenchido so acontece em linha importada do base44 (0063), e significa "foi excluida, e quem excluiu nao ficou registrado".';

-- 4. negotiations: motivo de perda sem perda ------------------------------------

alter table public.negotiations
  drop constraint negotiations_loss_fields_require_lost_check;

alter table public.negotiations
  add constraint negotiations_loss_fields_require_lost_check
  check (
    status = 'lost'
    or (loss_reason is null and loss_notes is null)
    or legacy_id is not null
  );

comment on constraint negotiations_loss_fields_require_lost_check on public.negotiations is
  'Motivo e observacao de perda so em negociacao perdida. O original nao impede negociacao Ativa com motivo de perda preenchido, e o kanban exibe esse motivo no card - entao o estado invalido chega ate a tela. A EXCECAO EXISTE POR CAUSA DA IMPORTACAO e some quando legacy_id e nulo: 1 negociacao do base44 chega com motivo e observacao de perda e status que nao e Perdida. Apagar o motivo perderia o texto que alguem escreveu; trocar o status inventaria um desfecho. Ver o cabecalho da 0063.';

-- 5. suppliers: tipologia que so vale em item de orcamento ----------------------

alter table public.suppliers
  drop constraint suppliers_category_domain_check;

alter table public.suppliers
  add constraint suppliers_category_domain_check
  check (
    category::text <> all (array['facade_cladding', 'pool_cladding',
                                 'waterproofing', 'drywall_plaster'])
    or legacy_id is not null
  );

comment on constraint suppliers_category_domain_check on public.suppliers is
  'Os quatro valores de supplier_category que so existem em item de orcamento (ver 0048), barrados em fornecedor porque o formulario do original nao os oferece. A EXCECAO EXISTE POR CAUSA DA IMPORTACAO e some quando legacy_id e nulo: 1 fornecedor do base44 esta cadastrado como "Revestimento de Fachada", tipologia real e conhecida, cuja troca por "Outros" apagaria um fato (e derrubaria 2 marcas por cascata). Diferente do fornecedor com tipologia VAZIA, que entrou como other: la nao ha fato a apagar. CONSEQUENCIA PARA A TELA: o seletor de tipologia do formulario nao oferece esse valor, entao editar esse fornecedor por la exige escolher outra coisa - o valor sobrevive enquanto ninguem reeditar a tipologia. Ver o cabecalho da 0063.';
