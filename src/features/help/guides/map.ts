import { MapPin } from 'lucide-react'
import type { Guide } from '../types'

export const mapGuide: Guide = {
  title: 'Mapa de Projetos',
  icon: MapPin,
  menu: 'map',
  page: 'MapaProjetos',
  purpose: 'A localização de todos os projetos no mapa.',
  tasks: [
    {
      title: 'Achar uma propriedade',
      steps: [
        'Na coluna da esquerda, use Buscar por Cliente, Nome do Projeto, Status (do Projeto), Cidade (pins geocodificados) e Finalidade do Projeto.',
        'Clique numa propriedade da lista para centralizar o mapa nela.',
        'Buscar Localização leva o mapa a qualquer endereço ou lugar, inclusive fora do Brasil.',
        'No canto do mapa, troque a camada: Mapa, Satélite, Híbrido ou Relevo.',
      ],
    },
    {
      title: 'Ver os detalhes de uma propriedade',
      steps: [
        'Clique no pino para abrir o balão, com fotos, cliente, status e endereço.',
        'Ver Detalhes Completos abre o resumo, com projeto, cliente, localização, terreno, finalidade e loteamento.',
        'Nas fotos, as setas passam de uma para outra, e Ver em tela cheia amplia a foto.',
      ],
    },
    {
      title: 'Marcar uma propriedade nova',
      edit: true,
      steps: [
        'Clique em + Nova Propriedade no Mapa. O botão passa a dizer Clique no mapa para marcar.',
        'Clique no ponto exato do mapa. O endereço é detectado e aparece em Endereço Detectado.',
        'Escolha o projeto em Nome do Projeto e o Cliente. Sem projeto vinculado, escolha o Status Visual do pino.',
        'Se quiser, preencha terreno, finalidade, loteamento, quadra, lote e as áreas em m². Clique em Criar Propriedade.',
      ],
    },
    {
      title: 'Pôr fotos na propriedade',
      edit: true,
      steps: [
        'No balão do pino ou em Ver Detalhes Completos, clique em Adicionar fotos.',
        'Aceita JPG, PNG ou WebP de até 10 MB, com no máximo 20 fotos por propriedade.',
        'Para tirar uma foto, use o botão de remover sobre ela e confirme.',
      ],
    },
    {
      title: 'Corrigir ou remover uma propriedade',
      edit: true,
      steps: [
        'Clique no pino e em Ver Detalhes Completos.',
        'Editar Informações abre o formulário. Salve com Salvar Alterações.',
        'Ajustar Localização deixa o pino solto: arraste até o lugar certo e clique em Salvar.',
        'Remover do Mapa pede confirmação.',
      ],
    },
  ],
  links: [
    { key: 'projects', why: 'O projeto ligado a cada pino.' },
    { key: 'crm', why: 'O cliente de cada propriedade.' },
  ],
}
