-- "Concluido/pago sem data" passa a ser aceito SO em linha importada do base44.
--
-- A REGRA QUE ESTA MIGRATION INAUGURA, E QUE VALE PARA A 0063 E A 0064
--   A restricao passa a distinguir dado IMPORTADO de dado NASCIDO AQUI, e o
--   discriminador e `legacy_id`.
--
--   Toda tabela migrada tem `legacy_id text` com o id da linha no base44,
--   preenchido SO pela importacao (decisao registrada desde a 0003). Linha com
--   legacy_id preenchido veio de la; linha com legacy_id nulo nasceu nesta
--   aplicacao. Entao, onde havia `check (X)`, passa a haver
--   `check (X or legacy_id is not null)`. O efeito e triplo:
--
--     1. nada se perde na importacao - o base44 nao guardava aquilo, e recusar a
--        linha perderia tambem o fato que ele guardava;
--     2. o sistema NAO afrouxa - tudo que a tela criar daqui em diante continua
--        obrigado exatamente como antes, porque a tela nunca preenche legacy_id;
--     3. e auditavel - toda linha que usou a excecao aparece em uma consulta.
--        Exemplo, para as quatro tabelas desta migration:
--
--          select id, legacy_id, status, payment_date
--            from public.accounts_receivable
--           where legacy_id is not null
--             and (status = 'paid') <> (payment_date is not null);
--
--   Isso e DIFERENTE de derrubar o check, que foi o que a 0060 fez em
--   task_checklist_items. La a tela tambem nao tinha como preencher a data (o
--   item de checklist nao tem campo de conclusao em lugar nenhum), entao nao
--   havia regra a preservar. Aqui a tela TEM: quem marca uma parcela como paga
--   escolhe a data no formulario, e continua obrigado a isso.
--
--   LIMITE CONHECIDO, e ele e o preco: a excecao acompanha a LINHA, nao o
--   momento da importacao. Uma parcela importada continua podendo ser editada
--   para "paga sem data" pela tela, para sempre. Fechar isso pediria congelar o
--   estado do dia da importacao em outra coluna, o que e mais schema e mais
--   caminho de erro do que a regra vale. Fica escrito.
--
-- O CASO CONCRETO
--   O base44 guarda a BANDEIRA e nao a data. Sao, no export do escritorio:
--     15 recebiveis "Pago" sem payment_date  (R$ 146.500)
--      2 contas a pagar "Pago" sem payment_date (+3 ocorrencias que caiam so por
--        cascata da linha-mae)
--      9 atividades "Concluida" sem data_conclusao_real, e 1 com a data
--        preenchida e status "Nao iniciada" - alguem reabriu uma atividade
--        concluida e o base44 manteve as duas metades
--      1 tarefa "Concluida" sem completion_date
--
--   As tres saidas eram as mesmas da 0060: recusar, inventar ou admitir que a
--   data se perdeu. Recusar tiraria R$ 146.500 recebidos da carteira e faria
--   trabalho concluido voltar a aparecer como pendente. Inventar (usar
--   `updated_date` como se fosse o pagamento) gravaria como FATO uma data que
--   ninguem registrou, e dado inventado nao se distingue de dado verdadeiro
--   depois de gravado. Fica a terceira: nulo significa "aconteceu, e o quando
--   nao foi registrado".
--
--   A equivalencia e afrouxada nos DOIS sentidos, e nao so no lado
--   "concluido sem data", porque a linha 10 de activities e do outro lado - o
--   fato que ela guarda e "esta atividade ja foi concluida uma vez, em tal
--   dia, e voltou a nao iniciada". Recusar essa linha por causa do sentido
--   perderia a mesma informacao pelo mesmo motivo.
--
-- O QUE NAO MUDA
--   Nenhum outro check destas quatro tabelas. Em particular:
--   activities_started_at_not_after_completed_check continua de pe, entao tempo
--   negativo em total_minutes (coluna gerada) segue impossivel, importada ou
--   nao. E a view accounts_receivable_status (0043) nao muda: "em atraso" e
--   calculado por due_date e status, e nao por payment_date.
--
-- POR QUE MIGRATION NOVA
--   A 0032, a 0037 e a 0041 ja estao aplicadas. Migration aplicada nao se edita
--   (docs/ARCHITECTURE.md).

-- accounts_receivable ---------------------------------------------------------

alter table public.accounts_receivable
  drop constraint accounts_receivable_payment_date_matches_status_check;

alter table public.accounts_receivable
  add constraint accounts_receivable_payment_date_matches_status_check
  check (((status = 'paid') = (payment_date is not null)) or legacy_id is not null);

comment on constraint accounts_receivable_payment_date_matches_status_check on public.accounts_receivable is
  'Os dois sentidos da mesma regra, para toda parcela que NASCE AQUI: paga exige data, e data de pagamento exige status pago. O original grava status e data em chamadas independentes e aceita as duas metades soltas - parcela "Paga" sem data fica fora de todo relatorio por periodo, e parcela "Prevista" com data aparece recebida para quem le a data e prevista para quem le o status. A EXCECAO EXISTE POR CAUSA DA IMPORTACAO e some quando legacy_id e nulo: 15 parcelas do base44 (R$ 146.500) estao marcadas como pagas sem que a data tenha existido em lugar nenhum, e o campo nao existe naquela plataforma. Nelas, payment_date nulo significa "recebida, e o quando nao foi registrado". Ver o cabecalho da 0062.';

comment on column public.accounts_receivable.payment_date is
  'Data do recebimento efetivo. Amarrada a status nos DOIS sentidos por check, para tudo que nasce nesta aplicacao: pago sem data nao entra em relatorio por periodo, e data em parcela prevista a faz aparecer como recebida na conciliacao. Em linha IMPORTADA (legacy_id preenchido) a amarracao nao vale, porque o base44 guarda a bandeira e nao a data - ver 0062. Mesmo desenho de activities.completed_at (0037) e tasks.completion_date (0032).';

-- accounts_payable ------------------------------------------------------------

alter table public.accounts_payable
  drop constraint accounts_payable_payment_date_matches_status_check;

alter table public.accounts_payable
  add constraint accounts_payable_payment_date_matches_status_check
  check (((status = 'paid') = (payment_date is not null)) or legacy_id is not null);

comment on constraint accounts_payable_payment_date_matches_status_check on public.accounts_payable is
  'Gemea do check de accounts_receivable, e pelo mesmo motivo. A EXCECAO EXISTE POR CAUSA DA IMPORTACAO e some quando legacy_id e nulo: 2 despesas do base44 estao marcadas como pagas sem data, e com elas caiam 3 ocorrencias de recorrencia que so dependiam da linha-mae. Ver o cabecalho da 0062.';

-- activities ------------------------------------------------------------------

alter table public.activities
  drop constraint activities_completed_at_matches_status_check;

alter table public.activities
  add constraint activities_completed_at_matches_status_check
  check (((status = 'completed') = (completed_at is not null)) or legacy_id is not null);

comment on constraint activities_completed_at_matches_status_check on public.activities is
  'Conclusao amarrada ao status nos dois sentidos, para toda atividade que NASCE AQUI. Sem isto, total_minutes (coluna gerada) fica nulo em atividade concluida e o RelatorioProdutividade soma menos hora do que foi trabalhada. A EXCECAO EXISTE POR CAUSA DA IMPORTACAO e some quando legacy_id e nulo: 9 atividades do base44 estao concluidas sem data_conclusao_real, e 1 tem a data preenchida com status "Nao iniciada" - foi reaberta, e o base44 manteve as duas metades. Ver o cabecalho da 0062.';

-- tasks -----------------------------------------------------------------------

alter table public.tasks
  drop constraint tasks_completion_date_matches_status_check;

alter table public.tasks
  add constraint tasks_completion_date_matches_status_check
  check (((status = 'completed') = (completion_date is not null)) or legacy_id is not null);

comment on constraint tasks_completion_date_matches_status_check on public.tasks is
  'Conclusao amarrada ao status nos dois sentidos, para toda tarefa que NASCE AQUI. A EXCECAO EXISTE POR CAUSA DA IMPORTACAO e some quando legacy_id e nulo: 1 tarefa do base44 chega com as duas metades soltas. Mesma familia da 0060, que ja aceitou item de checklist concluido sem data - la o check caiu inteiro porque a tela tambem nao tinha como preencher; aqui a tela tem, e continua obrigada. Ver o cabecalho da 0062.';
