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
}
