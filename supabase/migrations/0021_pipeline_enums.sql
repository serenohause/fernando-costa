-- Modulo 3 (Pipeline) - enums de Negociacao e de ClientIntake.
--
-- Mesma estrutura da 0001 e da 0014: o que e infraestrutura do modulo (tipos)
-- vem em migration propria, antes das tabelas, para que a migration da tabela
-- seja lida como o desenho do dado e nada mais.
--
-- Valores conforme a coluna "Postgres" de docs/ENUM-MAP.md, secao Pipeline.
-- Rotulo em portugues vive na UI (src/lib/enums.ts), nunca no banco.

create type public.service_type as enum (
  'architecture',
  'interiors',
  'structural',
  'plumbing',
  'electrical',
  'consulting'
);

create type public.negotiation_status as enum ('active', 'won', 'lost');

create type public.funnel_stage as enum (
  'lead_received',
  'qualified',
  'proposal_sent',
  'negotiating',
  'closing'
);

create type public.lead_origin as enum (
  'instagram',
  'referral',
  'website',
  'event',
  'other'
);

create type public.loss_reason as enum (
  'price',
  'timeline',
  'chose_competitor',
  'postponed',
  'no_response',
  'other'
);

create type public.client_intake_status as enum ('active', 'expired', 'submitted');

-- Nao esta em docs/ENUM-MAP.md porque no base44 este campo e texto livre
-- (ClientIntake.ultimo_status_validacao, descrito como "OK, TOKEN_VAZIO,
-- NAO_ENCONTRADO, EXPIRADO, ENVIADO"). Vira enum aqui: e coluna de auditoria,
-- e auditoria escrita em texto livre acumula grafia divergente ate ninguem
-- conseguir mais agrupar por ela. Os dois valores do original que NAO entram
-- sao TOKEN_VAZIO e NAO_ENCONTRADO: os dois descrevem uma tentativa em que
-- NENHUMA linha foi encontrada, entao nao ha linha onde grava-los - no
-- original tambem nao ha, o codigo lanca o erro antes de qualquer update.
create type public.client_intake_validation_status as enum (
  'created',
  'ok',
  'expired',
  'already_submitted',
  'expired_on_submit',
  'submitted'
);

comment on type public.service_type is
  'Servico oferecido na negociacao. De/para: architecture=Arquitetura, interiors=Interiores, structural=Estrutura, plumbing=Hidrosanitario, electrical=Eletrico, consulting=Consultoria. No original e array dentro da propria linha (Negociacao.tipo_servico); aqui vira linha em negotiation_services, porque o funil filtra por tipo de servico.';

comment on type public.negotiation_status is
  'Situacao da negociacao. De/para: active=Ativa, won=Ganha, lost=Perdida. Governa dois checks de negotiations: motivo e observacao de perda so existem em lost, e data de fechamento so existe em won ou lost.';

comment on type public.funnel_stage is
  'Etapa do funil comercial, na ordem em que a coluna aparece no kanban. De/para: lead_received=Lead recebido, qualified=Qualificado, proposal_sent=Proposta enviada, negotiating=Em negociacao, closing=Fechamento.';

comment on type public.lead_origin is
  'Canal por onde a oportunidade chegou. De/para: instagram=Instagram, referral=Indicacao, website=Site, event=Evento, other=Outro. SUPERCONJUNTO de public.lead_source (modulo 2), que nao tem event: quando "Criar Oportunidade" copia clients.lead_source para negotiations.origin, a conversao e lead_source::text::lead_origin, e os quatro valores de lead_source existem aqui com a mesma grafia de proposito. Ha caso de teste que falha se alguem renomear um lado so.';

comment on type public.loss_reason is
  'Motivo da perda. De/para: price=Valor, timeline=Prazo, chose_competitor=Escolheu outro escritorio, postponed=Vai adiar o projeto, no_response=Nao respondeu, other=Outro.';

comment on type public.client_intake_status is
  'Situacao do formulario publico de briefing. De/para: active=Ativo, expired=Expirado, submitted=Enviado. Quem faz a transicao active->expired e active->submitted e o servidor (public.open_client_intake / public.submit_client_intake), nunca o navegador.';

comment on type public.client_intake_validation_status is
  'Resultado da ultima tentativa de uso do link publico, gravado server-side para investigacao. De/para com o texto livre do original: created=CRIADO, ok=OK, expired=EXPIRADO, already_submitted=ENVIADO, expired_on_submit=EXPIRADO_NO_ENVIO, submitted=(sucesso do envio, que o original grava so mudando o status). TOKEN_VAZIO e NAO_ENCONTRADO nao tem equivalente porque descrevem tentativa sem linha correspondente. A resposta ao visitante NAO muda em funcao deste campo: recusa e sempre a mesma, por decisao de docs/SCHEMA-PLAN.md.';
