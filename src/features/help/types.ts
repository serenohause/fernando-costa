import type { LucideIcon } from 'lucide-react'
import type { CollaboratorRole } from '@/lib/enums'

/*
  Passo de um guia. Texto puro, ou com `needs`: o menu em que a pessoa precisa
  de EDIÇÃO para o passo funcionar. É o caso de tela que DESABILITA o botão e
  avisa (BriefingReview.tsx) — o passo aparece, com o cadeado.
*/
export type GuideStep = string | { t: string; needs: string }

/*
  `edit: true` marca tarefa que depende de botão que a TELA ESCONDE de quem só
  vê (Projects.tsx, Negociacoes.tsx). Para essa pessoa a tarefa some do guia e
  entra uma linha dizendo quantas ficaram de fora.
*/
export type GuideTask = {
  title: string
  edit?: boolean
  steps: GuideStep[]
  note?: string
}

export type GuideLink = {
  key: string
  why: string
  via?: string
}

export type Guide = {
  title: string
  icon: LucideIcon
  purpose: string
  /* Todo mundo vê, sem menu (primeiros passos, Perfil, a própria Central). */
  always?: boolean
  /* O menu que libera o guia; o mesmo `menus.key` da matriz de permissões. */
  menu?: string
  /* Guia sem tela própria, liberado por outro menu (Formulário de briefing). */
  needsMenu?: string
  special?: 'productivity' | 'impersonate'
  /* Nome da rota (`/<page>`), para o "?" achar o guia da tela atual. */
  page?: string
  /* Tela liberada por função, e não por permissão (Minhas Atividades). */
  byRole?: boolean
  /* Guia completo. Sem `tasks`, o guia é "em breve": só a frase de propósito. */
  tasks?: GuideTask[]
  links?: GuideLink[]
}

export type Trail = {
  n: number
  title: string
  desc: string
  guides: string[]
}

export type AccessKind = 'role' | 'edit' | 'view' | 'none'

/*
  O acesso da pessoa, já resolvido. Sai do que o AppLayout já carregou: os itens
  de `buildNavigation` e as linhas de `collaborator_permissions`.
*/
export type HelpAccess = {
  role: CollaboratorRole | null
  /* Os menus que a pessoa consegue abrir, pela mesma regra da barra lateral. */
  openMenus: ReadonlySet<string>
  /* Menus com `can_edit`. Diretor edita tudo, como em `can_edit_menu()`. */
  editMenus: ReadonlySet<string>
  isDirector: boolean
  /* `menus.label_pt` por chave, para o "precisa de edição em <menu>". */
  menuLabels: ReadonlyMap<string, string>
}
