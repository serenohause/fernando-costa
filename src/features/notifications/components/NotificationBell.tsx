import { useState } from 'react'
import { Bell } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { rotuloDoContador } from '../agrupar'
import { useUnreadNotificationCount } from '../hooks'
import NotificationPanel from './NotificationPanel'

/*
  O SINO, primeiro item do grupo da direita do cabeçalho — decisão do usuário
  sobre o protótipo ("fica como desenhado"), e o motivo está no próprio
  protótipo: é o item que muda de estado sozinho, e quem procura notificação
  procura na ponta.

  DOIS INVÓLUCROS, UM POR TAMANHO DE TELA, e a escolha é do CSS.

  O painel de 24rem não cabe em 360px, então no celular o mesmo conteúdo sobe do
  rodapé numa folha (Sheet side="bottom"), que é o que o protótipo desenha na
  seção 8. Quem decide qual dos dois aparece é `hidden sm:block` / `sm:hidden`, e
  não uma leitura de largura em JavaScript: o app inteiro é responsivo por CSS
  (a barra lateral, a navegação inferior, o cabeçalho), não há uma única leitura
  de `matchMedia` no projeto, e introduzir a primeira só para escolher entre dois
  invólucros seria inventar infraestrutura para um problema que a cascata
  resolve. O gatilho escondido por `display: none` não é clicável e sai da árvore
  de acessibilidade, então nunca há dois painéis abertos nem dois sinos
  anunciados.

  `sm` (640px) é o corte: acima dele os 24rem do painel sobram com folga, e
  abaixo dele a folha de largura total é a única coisa que cabe. O protótipo
  mostra os dois extremos (desktop e 360px) e não nomeia o ponto de virada;
  este é o `sm` que o resto do app já usa.

  UMA CONSULTA SÓ, apesar dos dois invólucros: os dois sinos leem a mesma chave
  de cache, e o React Query não busca duas vezes.
*/

function ContadorDoSino({ naoLidas }: { naoLidas: number }) {
  const rotulo = rotuloDoContador(naoLidas)
  if (rotulo === null) return null

  return (
    /*
      Cópia literal do badge de atividades atrasadas em QuickActions.tsx,
      inclusive o `text-white` fixo — rose-500 é escuro o bastante para texto
      branco nos dois temas, e `text-primary-foreground` inverteria no escuro.

      `min-w-5` em vez de `w-5` é o único acréscimo, e é do protótipo: largura
      fixa deformaria o quadrado quando o número vira "9+".
    */
    <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 py-0 flex items-center justify-center border-transparent bg-counter text-white text-xs font-semibold tabular-nums leading-none shadow-sm">
      {rotulo}
    </Badge>
  )
}

/*
  "Notificações, 3 não lidas" / "Notificações, nenhuma não lida" — o rótulo
  acessível do protótipo. O badge é `aria-hidden` lá, e aqui é `<Badge>` sem
  texto alternativo pelo mesmo motivo: a contagem já está dita no nome do botão,
  e dizê-la duas vezes faria o leitor de tela anunciar "3" solto.
*/
function rotuloDoBotao(naoLidas: number): string {
  if (naoLidas <= 0) return 'Notificações, nenhuma não lida'
  return `Notificações, ${naoLidas} ${naoLidas === 1 ? 'não lida' : 'não lidas'}`
}

export default function NotificationBell() {
  const naoLidasQuery = useUnreadNotificationCount()
  /*
    Falha na contagem NÃO acende o sino nem mostra erro no cabeçalho: badge é
    marca, e marca que aparece por engano treina o olho a ignorar o canto. Quem
    abrir o painel vê o erro de leitura lá, com "Tentar novamente".
  */
  const naoLidas = naoLidasQuery.data ?? 0

  const [popoverAberto, setPopoverAberto] = useState(false)
  const [folhaAberta, setFolhaAberta] = useState(false)

  const gatilho = (
    <Button variant="ghost" size="icon" className="relative" aria-label={rotuloDoBotao(naoLidas)}>
      <Bell className="w-5 h-5 select-none" />
      <ContadorDoSino naoLidas={naoLidas} />
    </Button>
  )

  return (
    <>
      <div className="hidden sm:block">
        <Popover open={popoverAberto} onOpenChange={setPopoverAberto}>
          <PopoverTrigger asChild>{gatilho}</PopoverTrigger>
          {/*
            24rem de largura, alinhado à direita, sem padding (as linhas vão até
            a borda) e `overflow-hidden` para a faixa de dia grudada não vazar
            pelo canto arredondado. `shadow-lg` é o do dropdown-menu, como o
            protótipo anotou.
          */}
          <PopoverContent
            align="end"
            sideOffset={4}
            className="w-96 max-w-[calc(100vw-2rem)] p-0 overflow-hidden shadow-lg"
          >
            <NotificationPanel aberto={popoverAberto} onFechar={() => setPopoverAberto(false)} />
          </PopoverContent>
        </Popover>
      </div>

      <div className="sm:hidden">
        <Sheet open={folhaAberta} onOpenChange={setFolhaAberta}>
          <SheetTrigger asChild>{gatilho}</SheetTrigger>
          <SheetContent
            side="bottom"
            /* O X padrão do canto sai: o painel desenha o próprio fechar na
               linha do título, como o protótipo mostra. */
            hideClose
            className="p-0 gap-0 max-h-[85%] flex flex-col bg-popover text-popover-foreground rounded-t-xl"
          >
            {/*
              ALÇA DE ARRASTE: a folha do shadcn não tem, mas puxar para baixo é
              o que a pessoa tenta no celular, e sem a alça a folha parece uma
              tela presa. A sinalização é só visual, como no protótipo — o gesto
              em si não foi implementado.
            */}
            <div aria-hidden="true" className="w-10 h-1 rounded-full bg-border mx-auto mt-2 shrink-0" />
            <NotificationPanel
              aberto={folhaAberta}
              compacto
              onFechar={() => setFolhaAberta(false)}
              tituloAs={SheetTitle}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
