-- Quem indicou passa a poder ser UM CLIENTE DO ESCRITORIO, e nao so um nome.
--
-- O CASO
--   A 0082 abriu `referrer_name`, texto livre. Na pratica quem mais indica sao
--   os proprios clientes — e digitar o nome de novo produz tres coisas ruins:
--   grafia divergente ("Ana Paula" / "Ana P. Souza") que nao cruza com nada,
--   nenhuma forma de responder "quem este cliente ja indicou", e um nome que
--   envelhece sozinho quando o cadastro e renomeado.
--
--   Pedido do usuario: poder ESCOLHER entre os clientes cadastrados.
--
-- POR QUE O TEXTO LIVRE CONTINUA
--   Indicacao tambem vem de arquiteto parceiro, fornecedor, amigo do diretor —
--   gente que nao e cliente e nao deve virar um para caber neste campo.
--   Obrigar a escolha cadastraria cliente que nao existe, que e o oposto do que
--   a deduplicacao das 0065/0076 defende. A tela oferece a busca e uma saida.
--
-- `referrer_name` CONTINUA SENDO GRAVADO NOS DOIS CASOS
--   Quando ha cliente escolhido, ele recebe o nome daquele cliente. Isso mantem
--   de pe tudo que ja le por nome (o detalhe do cliente, o pipeline, o contrato
--   gerado por mark_negotiation_won) sem que nada precise aprender a fazer join
--   — e preserva a informacao quando o cadastro do indicador for apagado, que e
--   exatamente quando `on delete set null` zera o ponteiro.
--
--   O check abaixo guarda essa invariante: ponteiro sem nome nunca existe.

alter table public.clients
  add column referrer_client_id uuid;

-- COMPOSTA COM tenant_id: sem isso, daria para apontar o indicador para um
-- cliente de OUTRO escritorio — um vazamento de nome atraves de uma FK.
-- A LISTA DE COLUNAS DO SET NULL NAO E DETALHE: sem ela, SET NULL zera TODAS as
-- colunas da referencia — tenant_id incluso, que e NOT NULL. O efeito real
-- nao seria "solta o vinculo", e sim 23502 ao apagar o cliente que indicou.
-- Mesma armadilha que a 0073 desarmou no modulo 11, e o caso 6B.5 de
-- crm-schema.sql e quem acusa se ela voltar.
alter table public.clients
  add constraint clients_referrer_client_fkey
    foreign key (referrer_client_id, tenant_id)
    references public.clients (id, tenant_id)
    on delete set null (referrer_client_id);

-- Cliente nao indica a si mesmo. Nao e hipotese remota: a busca da tela lista
-- todos os clientes, e o cadastro que esta sendo editado esta entre eles.
alter table public.clients
  add constraint clients_referrer_not_self_check
    check (referrer_client_id is null or referrer_client_id <> id);

-- Ponteiro sem nome nao existe: quem le por nome (a maior parte do sistema)
-- nunca encontra "indicado por ninguem" onde ha um indicador registrado.
alter table public.clients
  add constraint clients_referrer_client_needs_name_check
    check (referrer_client_id is null or referrer_name is not null);

-- Parcial porque a coluna e nula na esmagadora maioria das linhas: o indice
-- serve a pergunta "quem este cliente indicou", que so faz sentido para quem
-- indicou alguem.
create index clients_tenant_id_referrer_client_id_idx
  on public.clients (tenant_id, referrer_client_id)
  where referrer_client_id is not null;

comment on column public.clients.referrer_client_id is
  'O cliente do escritorio que fez a indicacao, quando ha um. Nulo quando quem indicou nao e cliente (arquiteto parceiro, fornecedor) ou quando o cadastro do indicador foi apagado - `on delete set null`. `referrer_name` continua preenchido nos dois casos, e e por ele que o resto do sistema le.';
