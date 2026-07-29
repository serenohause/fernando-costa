import { Lock } from 'lucide-react'

/*
  Bloco que Collaborators.jsx e AprovacoesAcesso.jsx repetem, idêntico nos dois,
  quando quem abre a página não é Diretor. Aqui é um componente só porque a
  marcação é a mesma; o que muda é a última linha.

  A microcopy do original diz "Apenas Admin e Diretor". Esse "Admin" é o papel
  de PLATAFORMA do base44, que não tem equivalente neste sistema (o mais
  próximo é o service_role, que não passa por policy) — ver migration 0012.
  Prometer na tela um papel que não existe é pior que corrigir o texto, então
  a frase fala só do Diretor. Divergência deliberada, registrada no relatório
  do módulo.
*/
export default function AcessoNegado({ detalhe }: { detalhe: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-rose-100 dark:bg-rose-950/40 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-10 h-10 text-rose-600 dark:text-rose-400" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Acesso Negado</h2>
        <p className="text-soft mb-6">Você não tem permissão para acessar este módulo.</p>
        <p className="text-sm text-muted-foreground">{detalhe}</p>
      </div>
    </div>
  )
}
