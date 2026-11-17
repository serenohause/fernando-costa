import { Search } from 'lucide-react'
import type { Guide } from '../types'

export const searchGuide: Guide = {
  title: 'Buscar',
  icon: Search,
  always: true,
  purpose: 'A lupa do cabeçalho procura clientes, projetos, contratos e tarefas de uma vez.',
  tasks: [
    {
      title: 'Buscar em todo o sistema',
      steps: [
        'Clique na lupa, no cabeçalho.',
        'Digite ao menos 2 letras. A busca roda enquanto você digita.',
        'Os resultados vêm em grupos: Clientes, Projetos, Contratos, Propostas, Negociações, Tarefas, Atividades e Fornecedores. Cada grupo mostra até 8.',
      ],
    },
    {
      title: 'O que dá para digitar',
      steps: [
        'Cliente: nome, e-mail, telefone, documento ou cidade.',
        'Contrato e proposta: número do contrato, nome do projeto ou do cliente.',
        'Projeto e negociação: o nome dele ou o nome do cliente.',
        'Tarefa e atividade: o texto dela ou o nome do projeto. Fornecedor: nome, contato ou cidade.',
      ],
    },
    {
      title: 'Abrir um resultado',
      steps: [
        'Clique no resultado, ou use as setas ↑↓ e aperte Enter.',
        'Cliente abre a ficha no CRM. Os outros abrem a tela deles, com o registro em destaque.',
        'Esc fecha a busca.',
      ],
    },
    {
      title: 'Não achei o que procurava',
      steps: [
        'A busca só mostra resultados das telas liberadas para você na barra lateral.',
        'Em Nenhum resultado, tente parte do nome, o número do contrato ou o telefone do cliente.',
      ],
    },
  ],
  links: [
    { key: 'crm', why: 'Onde abre o cliente encontrado.' },
    { key: 'sidebar', why: 'As telas liberadas para você são as que a busca alcança.' },
  ],
}
