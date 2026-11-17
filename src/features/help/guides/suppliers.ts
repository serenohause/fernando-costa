import { Store } from 'lucide-react'
import type { Guide } from '../types'

export const suppliersGuide: Guide = {
  title: 'Fornecedores',
  icon: Store,
  menu: 'suppliers',
  page: 'Fornecedores',
  purpose: 'Cadastro de fornecedores com tipologia, marca e nível de parceria.',
  tasks: [
    {
      title: 'Encontrar um fornecedor',
      steps: [
        'Digite no campo Buscar por nome ou marca... A busca ignora acentos.',
        'Ao lado, filtre por tipologia, nível de parceria e status.',
        'Clique na linha para abrir o painel com Contato Comercial, Parceria Comercial, Logística e Métricas.',
        'O botão WhatsApp, no painel, abre a conversa com o contato do fornecedor.',
      ],
    },
    {
      title: 'Cadastrar um fornecedor',
      edit: true,
      steps: [
        'Clique em Novo Fornecedor.',
        'Preencha Nome, Tipologia e WhatsApp, que são obrigatórios.',
        'Em Marcas Representadas, digite a marca e tecle Enter ou clique no +. O X no selo tira a marca.',
        'Clique em Criar Fornecedor.',
      ],
    },
    {
      title: 'Editar, inativar ou excluir',
      edit: true,
      steps: [
        'Abra o fornecedor e clique em Editar. Salve com Salvar Alterações.',
        'Inativar muda o status para Inativo sem apagar nada. Reativar volta o status para Ativo, inclusive de quem está Em negociação.',
        'Excluir pede confirmação. Fornecedor que já cotou ou foi escolhido num item de orçamento não pode ser excluído: use Inativar.',
      ],
    },
  ],
  links: [
    { key: 'client_budget', why: 'Onde os fornecedores são cotados e escolhidos para cada item.' },
  ],
}
