-- Corrige o comentario das policies de SELECT do financeiro, que descrevia uma
-- trava inexistente.
--
-- O QUE ESTAVA ERRADO
--   A 0042 escreveu, nas tres policies de leitura, que "quem NAO deveria abrir a
--   tela ja e barrado pelo menu (receivables com can_view)". Nao e. A permissao
--   de menu apenas ESCONDE o item da barra lateral; ela nao guarda a rota, e
--   redirectTargetFor (src/features/auth/access.ts) so redireciona papel
--   individual (arquiteto e estagiario). Coordenador ou administrativo sem o
--   menu digita /AccountsReceivable na URL, a tela renderiza, e a carteira
--   inteira do escritorio carrega.
--
--   A auditoria do modulo 7 provou com login real: o coordenador Rafael, com
--   receivables can_view = false, leu as 28 parcelas e a soma de R$ 693.000.
--
-- POR QUE O COMPORTAMENTO FICA
--   Decisao do usuario: fazer como o original. E o que ja acontecia la — as
--   entidades do base44 nao declaram restricao de leitura, e nem
--   AccountsReceivable.jsx nem AccountsPayable.jsx checam permissao em lugar
--   nenhum. A largura tambem e a mesma ja aprovada em clients (0017),
--   negotiations (0024), contracts (0030) e projects (0033).
--
--   Ou seja: o codigo estava certo e o comentario, errado. O risco de deixar
--   assim nao e o acesso — e alguem ler o comentario, acreditar que existe uma
--   segunda trava, e tomar decisao apoiado nela.
--
-- POR QUE MIGRATION NOVA
--   A 0042 ja esta aplicada. Migration aplicada nao se edita
--   (docs/ARCHITECTURE.md). COMMENT ON POLICY substitui o texto; nada de
--   estrutura muda aqui.

comment on policy accounts_receivable_select_active_collaborator on public.accounts_receivable is
  'Leitura larga, como em clients (0017), negotiations (0024), contracts (0030) e projects (0033): qualquer colaborador active do escritorio le a carteira. ATENCAO: a permissao de menu (receivables com can_view) apenas ESCONDE o item da barra lateral — ela NAO barra quem digita a URL na mao, e nao existe nenhuma trava compensatoria na rota. E o comportamento do original, confirmado com o usuario. Se um dia o escritorio quiser financeiro so para Diretor, Administrativo e Financeiro, o lugar do recorte e ESTA policy. is_active_collaborator() e o que mantem a regra transversal: colaborador em Ferias ou Afastado nao le nada.';

comment on policy accounts_payable_select_active_collaborator on public.accounts_payable is
  'Leitura larga, como em clients (0017), negotiations (0024), contracts (0030) e projects (0033): qualquer colaborador active do escritorio le a carteira. ATENCAO: a permissao de menu (payables com can_view) apenas ESCONDE o item da barra lateral — ela NAO barra quem digita a URL na mao, e nao existe nenhuma trava compensatoria na rota. E o comportamento do original, confirmado com o usuario. Se um dia o escritorio quiser financeiro so para Diretor, Administrativo e Financeiro, o lugar do recorte e ESTA policy. is_active_collaborator() e o que mantem a regra transversal: colaborador em Ferias ou Afastado nao le nada.';

comment on policy financial_categories_select_active_collaborator on public.financial_categories is
  'Leitura larga: qualquer colaborador active do escritorio le as categorias. Elas sao vocabulario do financeiro, nao dinheiro — o que a leitura revela e a lista de rubricas, e ela aparece nos filtros das duas telas. A permissao de menu (payables, que e onde categoria se pendura) apenas esconde o item da barra lateral, nao guarda a rota. is_active_collaborator() mantem a regra transversal: colaborador em Ferias ou Afastado nao le nada.';
