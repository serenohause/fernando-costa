-- Modulo 3 (Pipeline) - client_intakes, vindo de ClientIntake do base44
-- (36 campos). Formulario publico de briefing, aberto por link com validade de
-- 24h e preenchido pelo cliente final, sem login.
--
-- E A UNICA SUPERFICIE DO SISTEMA GRAVADA SEM SESSAO AUTENTICADA.
--
-- O QUE O ORIGINAL FAZ, E QUE NAO E PORTADO
--   projeto-original/src/pages/FormularioCliente.jsx, linhas 55-56:
--
--     const intakes = await base44.entities.ClientIntake.list();
--     const foundIntake = intakes.find(i => i.token === token);
--
--   A pagina e publica e o codigo baixa a LISTA INTEIRA de briefings para o
--   navegador para so entao comparar o token. ClientIntake carrega nome,
--   WhatsApp, e-mail, CPF/CNPJ, data de nascimento e dois enderecos completos:
--   se o backend atende a listagem, qualquer visitante da URL do formulario
--   recebe o dado pessoal de todos os clientes que ja receberam link, e nem
--   token valido e necessario, porque a listagem acontece ANTES da validacao.
--   Isso nao e decisao de layout e nao entra na regra de fidelidade
--   (docs/SCHEMA-PLAN.md, "O que o original faz, e por que nao pode ser
--   portado").
--
-- O DESENHO AQUI
--   A comparacao do token acontece no servidor, sempre. anon NAO recebe GRANT
--   nesta tabela nem EXECUTE nas funcoes de resolucao (migration 0025): a via
--   publica e exclusivamente edge function com service_role. Esta migration
--   cria a tabela; a 0025 cria a RLS, os grants e as duas funcoes que resolvem
--   o token.
--
-- O QUE MAIS NAO E PORTADO
--   - link_publico. O original guarda a URL absoluta do formulario dentro da
--     linha (Negociacoes.jsx:278 monta com window.location.origin). URL de
--     ambiente gravada em dado vira link quebrado quando o dominio muda, e nao
--     e dado do briefing: o link e derivavel do token pela camada que o exibe.
--   - negociacao_name e cliente_crm_name. Desnormalizacao do base44, que nao
--     tem join (regra de docs/ARCHITECTURE.md). O nome do cliente que a tela
--     publica exibe no titulo sai do join feito dentro de
--     public.open_client_intake, e nunca de uma copia guardada aqui.
--   - criado_em. E o created_at, que toda tabela deste projeto ja tem.

create table public.client_intakes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,

  -- Ver COMMENT abaixo: uuid v4 gerado pelo banco, unico em TODO o banco.
  token uuid not null default gen_random_uuid(),

  negotiation_id uuid,
  client_id uuid not null,

  status public.client_intake_status not null default 'active',
  expires_at timestamptz not null default (now() + interval '24 hours'),
  submitted_at timestamptz,

  -- Passo 1 do formulario: contato.
  full_name text,
  phone text,
  email extensions.citext,
  city text,
  state text,
  country text default 'Brasil',

  -- Passo 2: dados cadastrais e endereco de residencia.
  client_type public.client_type,
  tax_id text,
  birth_date date,
  address_zipcode text,
  address_street text,
  address_number text,
  address_district text,
  address_complement text,
  address_city text,
  address_state text,

  -- Passo 3: endereco da obra.
  site_zipcode text,
  site_street text,
  site_number text,
  site_district text,
  site_complement text,
  site_city text,
  site_state text,

  -- Registro server-side das tentativas de uso do link (ultimo_erro_link,
  -- ultimo_acesso_em, ultimo_status_validacao no original).
  last_link_error text,
  last_access_at timestamptz,
  last_validation_status public.client_intake_validation_status not null default 'created',

  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint client_intakes_id_tenant_id_key unique (id, tenant_id),
  constraint client_intakes_token_key unique (token),
  constraint client_intakes_tenant_id_legacy_id_key unique (tenant_id, legacy_id),

  constraint client_intakes_expires_after_creation_check
    check (expires_at > created_at),

  -- Enviado sem hora de envio, ou hora de envio sem estar enviado, sao os dois
  -- estados que fariam a tela publica e o painel discordarem sobre o que
  -- aconteceu. Escrito como equivalencia para valer nos dois sentidos.
  constraint client_intakes_submitted_at_matches_status_check
    check ((status = 'submitted') = (submitted_at is not null)),

  constraint client_intakes_email_format_check
    check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

-- FK compostas, pelo mesmo motivo de negotiations: a RLS filtra o que se le,
-- nao o que se aponta.
--
-- negotiation_id cascateia (o briefing e um satelite da negociacao; apagada a
-- negociacao, o briefing nao tem mais a quem pertencer), client_id nao (apagar
-- um cliente que tem briefing enviado falha, forcando decisao explicita sobre
-- dado pessoal que a pessoa mandou).
alter table public.client_intakes
  add constraint client_intakes_negotiation_id_fkey
  foreign key (negotiation_id, tenant_id)
  references public.negotiations (id, tenant_id)
  on delete cascade;

alter table public.client_intakes
  add constraint client_intakes_client_id_fkey
  foreign key (client_id, tenant_id)
  references public.clients (id, tenant_id);

comment on table public.client_intakes is
  'Formulario publico de briefing (ClientIntake do base44). Uma linha por link enviado ao cliente final. Unica tabela do sistema gravada sem sessao autenticada - e ainda assim anon nao tem privilegio algum sobre ela: quem grava e public.submit_client_intake (migration 0025), chamada por edge function com service_role. Tem tenant_id e RLS como qualquer outra tabela de negocio, para o lado autenticado.';

comment on column public.client_intakes.token is
  'Segredo do link publico. TRES decisoes, todas deliberadas:
   (1) uuid, e nao texto: gen_random_uuid() e v4, 122 bits de aleatoriedade de fonte criptografica. O original monta `${Date.now()}-${Math.random().toString(36)}` (Negociacoes.jsx:266) - o prefixo e o relogio, e portanto adivinhavel a partir do momento do envio, e Math.random nao e fonte segura. Token de link publico e a UNICA credencial desta superficie: previsivel ali significa acesso ao briefing de outra pessoa.
   (2) gerado pelo BANCO, no default. Token gerado no navegador ou na aplicacao pode ser reaproveitado, logado ou escolhido por quem chama; no default da coluna nao ha caminho de escrita que consiga escolher o valor sem esforco explicito.
   (3) unique GLOBAL, e nao por tenant. A resolucao publica acontece sem sessao e portanto sem tenant: public.open_client_intake recebe so o token. Unicidade por (tenant_id, token) permitiria dois escritorios com o mesmo token e a busca sem tenant devolveria duas linhas - exatamente a ambiguidade que o caso 1 de supabase/tests/client-intake.sql proibe.';

comment on column public.client_intakes.client_id is
  'Cliente do CRM a que este briefing pertence (cliente_crm_id). not null, como no original: o link so e gerado quando a negociacao vira Ganha, e a tela exige cliente vinculado antes disso. NUNCA sai na resposta publica - o que a tela publica exibe e o NOME, resolvido no servidor pelo join dentro de open_client_intake.';

comment on column public.client_intakes.expires_at is
  'Fim da validade do link. Default de 24h a partir de agora, que e a regra do original (Negociacoes.jsx:274), agora escrita no banco em vez de no navegador. Conferida SEMPRE no servidor, e de novo no envio: entre abrir o formulario e enviar podem passar horas, e no original quem confere as duas vezes e o proprio navegador.';

comment on column public.client_intakes.status is
  'active enquanto o link vale, expired depois do prazo, submitted depois do envio. Quem muda e o servidor (open_client_intake e submit_client_intake). O lado autenticado pode alterar pela RLS normal do menu pipeline - e o caminho para o escritorio invalidar um link a mao.';

comment on column public.client_intakes.city is
  'Cidade informada no passo 1 do formulario. Convive com address_city (passo 2, "cidade dos dados complementares") porque o original pergunta a cidade DUAS vezes, em dois passos, e grava as duas no mesmo campo do CRM na hora do envio - a segunda sobrescreve a primeira (FormularioCliente.jsx:124 e :138). As duas ficam guardadas aqui como a pessoa respondeu; qual delas prevalece e decisao de quem aplicar o briefing ao cadastro.';

comment on column public.client_intakes.last_validation_status is
  'Resultado da ultima tentativa de uso do link, gravado server-side. Existe para investigar link que "nao funciona" sem depender do relato de quem tentou. NAO muda a resposta ao visitante: recusa e sempre a mesma, venha ela de token inexistente, expirado ou ja enviado.';

comment on column public.client_intakes.last_link_error is
  'Descricao do ultimo erro de acesso (ultimo_erro_link). Texto livre, escrito so pelo servidor. Nunca recebe conteudo vindo de quem chamou: mensagem de erro montada com entrada do visitante e como texto de atacante entra em tela de escritorio.';

comment on constraint client_intakes_token_key on public.client_intakes is
  'Unicidade global, nao por escritorio: a resolucao publica do token acontece sem sessao e sem tenant. E o indice que public.open_client_intake e public.submit_client_intake usam - uma sondagem de indice por tentativa, o que tambem evita que a busca por token seja uma varredura sensivel a volume.';

-- Indices ---------------------------------------------------------------------
--
-- A leitura publica usa client_intakes_token_key. Estes dois sao do lado
-- autenticado: a lista de briefings do escritorio e o botao de copiar link da
-- linha da negociacao (IntakeLinkButton.jsx, que no original tambem baixa a
-- lista inteira para achar um).
create index client_intakes_tenant_id_created_at_idx
  on public.client_intakes (tenant_id, created_at desc);

create index client_intakes_tenant_id_negotiation_id_idx
  on public.client_intakes (tenant_id, negotiation_id);

create trigger client_intakes_set_updated_at
  before update on public.client_intakes
  for each row execute function public.set_updated_at();

-- RLS, GRANT E AS FUNCOES DE RESOLUCAO DO TOKEN ENTRAM NA 0025.
--
-- Ate la a tabela nasce sem privilegio para anon e authenticated (a 0007
-- desarmou o default privilege do papel postgres), o que a torna inalcancavel
-- pela chave publicavel - mas nao dispensa a policy: GRANT sem RLS entrega a
-- tabela inteira, e esta e a tabela do sistema com mais dado pessoal por linha.
