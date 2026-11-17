import { Handshake } from 'lucide-react'
import type { Guide } from '../types'

export const pipelineGuide: Guide = {
  title: 'Pipeline',
  icon: Handshake,
  menu: 'pipeline',
  page: 'Negociacoes',
  purpose:
    'O funil de vendas: cada oportunidade anda de Lead recebido até Fechamento e termina Ganha ou Perdida.',
  tasks: [
    {
      title: 'Ler o funil',
      steps: [
        'A aba Funil mostra as negociações ativas por etapa. Ativas, Ganhas e Perdidas mostram as mesmas em lista.',
        'Use o campo Buscar por negociação, cliente ou responsável...',
        'Em Ganhas, os cartões do topo somam Total Ganhas (30d), Soma Total e Ticket Médio.',
      ],
    },
    {
      title: 'Registrar uma oportunidade',
      edit: true,
      steps: [
        'Clique em Nova Oportunidade.',
        'Preencha Nome da Negociação, Tipos de Serviço e Responsável pela Negociação, que são obrigatórios.',
        'Escolha o Cliente, a Etapa do Funil e a Origem do Lead. Se a origem for Indicação, informe o Nome do Indicador.',
        'Clique em Criar Negociação.',
      ],
    },
    {
      title: 'Andar com a oportunidade no funil',
      edit: true,
      steps: [
        'Na aba Funil, arraste o cartão para a coluna seguinte: Lead recebido, Qualificado, Proposta enviada, Em negociação, Fechamento.',
        'Arrastar só muda a etapa, inclusive para Fechamento. Não encerra a negociação.',
        'O aviso amarelo do topo lista as negociações paradas há mais de 5 dias.',
      ],
    },
    {
      title: 'Encerrar: ganha ou perdida',
      edit: true,
      steps: [
        'Na aba Ativas, coluna Ações: o visto verde marca como ganha, o X vermelho marca como perdida.',
        'Ganha exige cliente vinculado. O link do formulário de briefing é copiado para você enviar ao cliente, e vale 24 horas. Errou? Clique em Desfazer no próprio aviso.',
        'Perdida abre o formulário com status Perdida e a data de hoje. Escolha o Motivo da Perda e salve.',
      ],
    },
    {
      title: 'Conferir o briefing que o cliente mandou',
      steps: [
        'Clique em Conferir, no aviso azul, ou em Briefings recebidos.',
        {
          t: 'O briefing não altera o cadastro sozinho. Compare campo a campo e clique em Aplicar no que estiver certo.',
          needs: 'crm',
        },
        {
          t: 'Com tudo conferido, Gerar contrato cria o contrato em Contratos & Propostas.',
          needs: 'pipeline',
        },
      ],
    },
  ],
  links: [
    { key: 'crm', why: 'O cliente da negociação e os dados aplicados do briefing.' },
    { key: 'intake_form', why: 'O que o cliente vê ao abrir o link.' },
    { key: 'contracts', why: 'Onde nasce o contrato gerado do briefing.' },
    { key: 'dashboard_commercial', why: 'O desempenho do funil por mês.' },
  ],
  tour: [
    {
      target: 'pipeline-new',
      edit: true,
      title: 'Registrar uma oportunidade',
      body: 'Nova Oportunidade abre o formulário. Nome, Tipos de Serviço e Responsável são obrigatórios.',
    },
    {
      target: 'pipeline-stalled',
      title: 'Negociações paradas',
      body: 'O aviso amarelo lista as negociações sem movimento há mais de 5 dias.',
    },
    {
      target: 'pipeline-intake',
      title: 'Briefing a conferir',
      body: 'O briefing do cliente não altera o cadastro sozinho. Conferir abre a comparação campo a campo.',
    },
    {
      target: 'pipeline-briefings',
      title: 'Briefings recebidos',
      body: 'Todos os briefings que chegaram, inclusive os já conferidos. É dali que sai o contrato.',
    },
    {
      target: 'pipeline-search',
      title: 'Buscar',
      body: 'Procura por negociação, cliente ou responsável.',
    },
    {
      target: 'pipeline-tabs',
      title: 'Funil e listas',
      body: 'Funil mostra as negociações ativas por etapa. Ativas, Ganhas e Perdidas mostram em lista.',
    },
    {
      target: 'pipeline-tab-active',
      edit: true,
      title: 'Encerrar: ganha ou perdida',
      body: 'Na aba Ativas, coluna Ações: o visto marca como ganha, o X como perdida. Ganha exige cliente vinculado.',
    },
    {
      target: 'pipeline-card',
      edit: true,
      title: 'Andar no funil',
      body: 'Arraste o cartão para a coluna seguinte. Arrastar só muda a etapa, não encerra a negociação.',
    },
    {
      target: 'pipeline-card-menu',
      edit: true,
      title: 'Editar ou excluir',
      body: 'No menu de três pontos do cartão ficam Editar e Excluir.',
    },
  ],
}
