import { Bell } from 'lucide-react'
import type { Guide } from '../types'

export const notificationsGuide: Guide = {
  title: 'Notificações',
  icon: Bell,
  always: true,
  purpose: 'O sino avisa quando alguém te atribui uma tarefa ou quando um prazo seu vence.',
  tasks: [
    {
      title: 'Ler os avisos',
      steps: [
        'O número no sino conta os avisos não lidos. Acima de 9, aparece 9+.',
        'Clique no sino. Os avisos vêm agrupados por dia: Hoje, Ontem e a data.',
        'Nova tarefa mostra quem atribuiu. Tarefa em atraso mostra quando o prazo venceu.',
      ],
    },
    {
      title: 'Abrir a tarefa do aviso',
      steps: [
        'Clique no aviso. Abre o Fluxo do Projeto com o cartão da tarefa em destaque.',
        'Abrir o aviso já o marca como lido.',
        'Se a tarefa foi apagada, o aviso continua na lista, mas sem link.',
      ],
    },
    {
      title: 'Marcar como lido',
      steps: [
        'O visto na linha marca um aviso como lido sem sair da tela.',
        'Marcar todas como lidas dá baixa em tudo de uma vez. No celular, é o ícone de dois vistos.',
      ],
    },
    {
      title: 'Quando chega um aviso',
      steps: [
        'Quando alguém te põe como responsável de uma tarefa no Fluxo do Projeto. Quem se atribui a própria tarefa não recebe aviso.',
        'Quando o prazo de uma tarefa sua passa e ela não foi concluída. A verificação roda uma vez por dia, de manhã cedo.',
        'Tarefa que vence hoje ainda não conta como atrasada.',
      ],
    },
  ],
  links: [
    { key: 'project_flow', why: 'Onde fica a tarefa de cada aviso.' },
    { key: 'my_activities', why: 'O seu resumo de prazos e projetos.' },
  ],
}
