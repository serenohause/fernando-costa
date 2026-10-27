-- O privilegio de service_role deixa de depender do ambiente.
--
-- NAO MUDA NADA EM DEV NEM EM PRODUCAO. Medido antes de escrever: service_role
-- ja tem INSERT em todas as tabelas de public no projeto de dev, e nenhuma
-- migration deste projeto revoga nada dele (zero ocorrencias de
-- `revoke ... from ... service_role`, em tabela ou em funcao). Este arquivo
-- escreve o que ja e verdade, para que deixe de ser verdade por acidente.
--
-- O PROBLEMA, MEDIDO
--   Comparando o banco de dev contra um banco descartavel com as 111 migrations
--   de main aplicadas do zero, os privilegios PADRAO do schema public divergem:
--
--     hospedado:      service_role = arwdDxtm   (insert, select, update, delete)
--     reconstruido:   service_role = Dxtm       (truncate, references, trigger,
--                                                maintain; nenhuma escrita)
--
--   A diferenca nao vem de migration nenhuma. Vem do bootstrap: o projeto
--   hospedado nasce com `alter default privileges ... grant all on tables to
--   anon, authenticated, service_role` (a 0007 documenta isso no cabecalho
--   dela), e a 0007 desarmou o default so para `anon` e `authenticated`,
--   deixando service_role intacto DE PROPOSITO, com estas palavras: "service_role
--   mantem tudo de proposito: e o bypass server-side". A imagem local da CLI
--   tem outro bootstrap, que ja da apenas Dxtm.
--
--   Ou seja: a intencao sempre foi a daqui. O que faltava era ela estar escrita
--   em migration em vez de herdada do ambiente.
--
-- O QUE QUEBRAVA SEM ISTO
--   Banco reconstruido so pelas migrations nasce com service_role sem escrita, e
--   scripts/criar-usuario.mjs (que grava em tenant_users e collaborators com a
--   chave de servico) falha nele. Era suspeita; virou medicao ao construir o
--   banco de referencia. O mesmo vale para qualquer edge function que escreva
--   direto em tabela com a chave de servico.
--
-- O QUE ESTE ARQUIVO NAO FAZ, E E DECISAO PENDENTE DO USUARIO
--   Nao fecha service_role. Fechar (deixar Dxtm e conceder tabela por tabela)
--   e a postura mais restritiva, e e a que o desenho da 0114 presumia, mas ela
--   QUEBRA os scripts acima e muda o comportamento de producao. Isso nao se
--   decide numa migration de consolidacao.
--
--   Tambem nao mexe no default de SEQUENCES, onde `anon` e `authenticated`
--   continuam com rwU no projeto hospedado: a 0007 fechou tabelas e nao
--   sequences. Hoje e inofensivo porque nao existe UMA sequence em public
--   (medido: zero), mas no dia em que nascer uma, ela nasce legivel pela chave
--   publicavel. Fechar isso muda comportamento de producao, entao fica
--   registrado aqui e nao aplicado.

-- 1. Tabelas que ja existem. No-op nos ambientes hospedados; e o que faz um
--    banco reconstruido alcancar o mesmo estado.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- 2. As proximas tabelas. Dentro de DO/EXECUTE pelo mesmo motivo da 0007:
--    ALTER DEFAULT PRIVILEGES FOR ROLE postgres exige ser membro de postgres, e
--    quem aplica a migration num projeto hospedado nem sempre e. Falhar aqui nao
--    derruba o push, e nao passa calado.
do $$
begin
  execute 'alter default privileges for role postgres in schema public grant all on tables to service_role';
  execute 'alter default privileges for role postgres in schema public grant all on sequences to service_role';
exception when insufficient_privilege then
  raise warning 'DEFAULT PRIVILEGES de service_role nao escrito: num banco reconstruido so pelas migrations, tabela nova nascera sem escrita para service_role e os scripts de operador falharao. Rodar como postgres: alter default privileges for role postgres in schema public grant all on tables to service_role;';
end
$$;
