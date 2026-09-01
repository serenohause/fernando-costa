-- O cadastro de cliente passa a guardar QUEM INDICOU.
--
-- O CASO
--   `clients.lead_source` ja tem "Indicação" como opcao desde a 0014, e o
--   formulario a oferece — mas nao havia onde escrever o nome de quem indicou.
--   O escritorio marcava a origem e perdia a informacao que da valor a ela: numa
--   indicacao, quem indicou E o dado. Sem ele, "Indicação" e indistinguivel de
--   "Outros".
--
--   O original tem o mesmo buraco (ClientForm.jsx:268 oferece a opcao e nao
--   pergunta o nome), e o pedido do usuario e para fecha-lo aqui.
--
-- IRMA DE `negotiations.referrer_name` (0022), DE PROPOSITO
--   Mesmo nome, mesmo tipo, mesma regra. O pipeline ja resolveu esta pergunta;
--   repetir a solucao e mais barato que inventar uma segunda forma de dizer a
--   mesma coisa — e permite, quando uma negociacao nascer de um cliente
--   indicado, levar o nome de um lado para o outro sem traduzir nada.
--
-- SEM CHECK LIGANDO AO lead_source, e a razao esta escrita na 0022:
--   "NAO ha check exigindo isso: o original tambem nao exige, e o campo continua
--   preenchido quando o usuario troca a origem depois - apagar por check
--   derrubaria a edicao inteira em vez de so limpar o campo."
--
--   Quem exige o preenchimento e a TELA, no momento em que a origem e Indicação
--   — mesma divisao de trabalho do pipeline. Banco recusar aqui transformaria
--   "mudei a origem de um cadastro antigo" em erro de gravacao.
--
-- 200 CARACTERES, como o campo irmao: e nome de pessoa, nao observacao.

alter table public.clients
  add column referrer_name text;

alter table public.clients
  add constraint clients_referrer_name_length_check
    check (referrer_name is null or length(referrer_name) <= 200);

comment on column public.clients.referrer_name is
  'Nome de quem indicou o cliente. Faz sentido apenas com lead_source = referral, e NAO ha check exigindo isso - mesma decisao (e mesmo motivo) de negotiations.referrer_name na 0022: o campo continua preenchido quando alguem troca a origem depois, e apagar por check derrubaria a edicao inteira em vez de so limpar o campo. Quem exige o preenchimento e a tela, quando a origem escolhida e Indicacao. Nulo em todo cliente importado do base44: a origem existe la, o nome de quem indicou nao.';
