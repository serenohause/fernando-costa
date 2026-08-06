-- budget_item_quotes ganha legacy_id, e a unicidade (item, fornecedor) passa a
-- valer sobre o que NASCE AQUI.
--
-- O CASO
--   10 cotacoes do export sao do MESMO fornecedor no MESMO item de orcamento,
--   com valores diferentes - o base44 nao impede, e o drawer dele marca as DUAS
--   como "Escolhido" quando isso acontece (ItemOrcamentoDrawer.jsx:146 compara
--   fornecedor_id com fornecedor_escolhido_id, sem desempate). A unique
--   (item_id, supplier_id) da 0049 recusa a segunda de cada par.
--
--   Sao cotacoes reais, com valor: recusa-las apaga a comparacao de preco que o
--   escritorio fez. E nao ha como escolher qual fica sem escolher tambem qual
--   preco vale.
--
-- POR QUE ESTA TABELA PRECISOU DE legacy_id, E O QUE ELE GUARDA
--   Ela nasceu SEM legacy_id, e o motivo esta escrito na 0049: no base44 a
--   cotacao nao tem id proprio - e um objeto solto dentro de um array
--   (fornecedores_cotados) que esta dentro de outro array (itens) que esta
--   dentro da linha de ChecklistOrcamento. A chave natural (item + fornecedor)
--   era o que tornava a reimportacao idempotente. Com duas cotacoes do mesmo
--   fornecedor no mesmo item, essa chave natural deixa de identificar a linha.
--
--   Entao legacy_id passa a guardar o ENDERECO do elemento na origem, e nao um
--   id que nao existe: item + fornecedor + posicao no array. Nao e invencao -
--   "a terceira cotacao do item X" e uma descricao verdadeira e estavel de onde
--   aquele dado estava. E o mesmo raciocinio de
--   budget_item_approval_files.legacy_id (0054), que guarda a URL do upload
--   porque aquele elemento tambem nao tem id.
--
--   Com ele vem o unique (tenant_id, legacy_id) que todas as outras tabelas
--   migradas tem, e que e o que faz a reimportacao atualizar em vez de duplicar.
--
-- A FORMA
--   Mesma das clients (0065), e pelo mesmo raciocinio, com as mesmas duas pecas:
--     a) o unique (item_id, supplier_id) vira INDICE unico PARCIAL
--        (where legacy_id is null) - continua impedindo duas cotacoes do mesmo
--        fornecedor criadas PELA TELA, com garantia de indice;
--     b) um trigger fecha o caso "cotacao nova x cotacao importada", que indice
--        nenhum expressa, levantando o mesmo 23505 com o mesmo nome.
--
--   O NOME e preservado (budget_item_quotes_item_id_supplier_id_key) porque o
--   frontend traduz o erro POR NOME DE CONSTRAINT, e nao por codigo:
--   BUDGET_ERROR_MESSAGES tem uma entrada com esse nome exato
--   (src/features/budget/hooks.ts). Mudar o nome trocaria a frase util
--   ("edite a cotacao existente") pela generica, sem que nada quebrasse - o tipo
--   de regressao que so aparece na tela de quem usa.
--
-- ATENCAO PARA A REEXECUCAO DA IMPORTACAO
--   `alter table ... drop constraint` derruba tambem o indice que a sustentava,
--   e o indice novo e PARCIAL. Indice parcial nao serve de alvo de ON CONFLICT
--   sem repetir o predicado, e o PostgREST nao repete: o passo 27 do
--   scripts/import-base44.mjs, que hoje faz upsert com
--   onConflict: 'item_id,supplier_id', passa a receber 42P10. Ele precisa passar
--   a conflitar por 'tenant_id,legacy_id', como os outros 21 passos ja fazem.
--   Isso e mudanca no script, nao no banco, e esta no relatorio desta etapa -
--   junto com o detalhe de que as cotacoes JA importadas estao com legacy_id
--   nulo e precisam receber o valor antes (ou ser apagadas e regravadas: elas
--   sao filhas puras do item, com ON DELETE CASCADE e nenhum dependente).
--
-- POR QUE MIGRATION NOVA
--   A 0049 ja esta aplicada. Migration aplicada nao se edita
--   (docs/ARCHITECTURE.md).

alter table public.budget_item_quotes
  add column legacy_id text;

alter table public.budget_item_quotes
  add constraint budget_item_quotes_tenant_id_legacy_id_key unique (tenant_id, legacy_id);

comment on column public.budget_item_quotes.legacy_id is
  'ENDERECO desta cotacao dentro do documento do base44, preenchido so pela importacao. Foge do padrao dos outros legacy_id, que guardam id de linha, e o motivo e que ESTE elemento nao tem id: e um objeto dentro do array fornecedores_cotados, que esta dentro do array itens, que esta dentro da linha de ChecklistOrcamento. O que identifica o elemento la e a posicao: item + fornecedor + ordem no array. Mesma solucao de budget_item_approval_files.legacy_id (0054). Nulo em tudo que nasce no sistema novo - e e por esse nulo que a unicidade (item, fornecedor) sabe a quem se aplicar (0066).';

-- a) A unicidade, agora parcial e como indice ----------------------------------

alter table public.budget_item_quotes
  drop constraint budget_item_quotes_item_id_supplier_id_key;

create unique index budget_item_quotes_item_id_supplier_id_key
  on public.budget_item_quotes (item_id, supplier_id)
  where legacy_id is null;

comment on index public.budget_item_quotes_item_id_supplier_id_key is
  'Um fornecedor cota um item uma vez - entre as cotacoes que NASCEM NESTA APLICACAO. O original nao impede duas cotacoes do mesmo fornecedor no mesmo item, e quando isso acontece o drawer marca as DUAS como "Escolhido" (ItemOrcamentoDrawer.jsx:146, sem desempate). Cotacao revisada substitui a anterior, e nao convive com ela. A CONDICAO legacy_id is null EXISTE POR CAUSA DA IMPORTACAO: 10 cotacoes do base44 sao repeticoes de fornecedor no mesmo item, com valores diferentes, e recusa-las apagaria a comparacao de preco que o escritorio fez. O caso "cotacao nova x cotacao importada" e fechado pelo trigger budget_item_quotes_reject_duplicate, nesta mesma migration. VIROU INDICE e deixou de ser constraint porque unicidade parcial so existe como indice; o NOME foi preservado porque o frontend traduz o erro por nome (BUDGET_ERROR_MESSAGES).';

-- b) O trigger que fecha "cotacao nova x cotacao importada" ---------------------

create or replace function public.budget_item_quotes_reject_duplicate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other uuid;
begin
  if new.legacy_id is not null then
    return null;
  end if;

  select q.id into v_other
    from public.budget_item_quotes q
   where q.item_id = new.item_id
     and q.supplier_id = new.supplier_id
     and q.id <> new.id
   limit 1;

  if v_other is not null then
    raise exception
      'duplicate key value violates unique constraint "budget_item_quotes_item_id_supplier_id_key"'
      using errcode = 'unique_violation',
            detail = 'Esse fornecedor ja tem uma cotacao neste item.',
            hint = 'Edite a cotacao existente em vez de adicionar outra.';
  end if;

  return null;
end;
$$;

comment on function public.budget_item_quotes_reject_duplicate() is
  'A metade da unicidade de cotacao que um indice nao consegue expressar: cotacao criada PELA TELA nao pode repetir o par (item, fornecedor) de uma cotacao IMPORTADA, embora duas importadas possam se repetir entre si (0066). Levanta 23505 com o nome do indice na mensagem, para que a frase da tela continue sendo "edite a cotacao existente" sem nenhuma mudanca em src/. AFTER e nao BEFORE por simetria com clients_reject_key_collision (0065), e porque aqui tambem a conferencia depende do estado ja gravado. SECURITY DEFINER para que a unicidade nao dependa da policy de SELECT da tabela; o recorte por item_id ja e do tenant, porque a FK de item e composta com tenant_id.';

create trigger budget_item_quotes_reject_duplicate
  after insert or update of item_id, supplier_id, legacy_id on public.budget_item_quotes
  for each row execute function public.budget_item_quotes_reject_duplicate();
