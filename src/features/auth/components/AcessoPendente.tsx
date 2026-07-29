import { Lock, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useSignOut } from '../hooks'

export default function AcessoPendente({ userEmail }: { userEmail: string | undefined }) {
  const signOut = useSignOut()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="max-w-lg w-full p-8">
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-amber-600" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 text-center mb-3">Aguardando Liberação</h1>

        <p className="text-slate-600 text-center mb-6">
          Seu e-mail foi validado com sucesso! Agora seu acesso precisa ser aprovado pelo
          administrador para que você possa utilizar o sistema.
        </p>

        <div className="bg-blue-50 rounded-lg p-4 mb-6 border border-blue-200">
          <p className="text-sm text-blue-900 mb-2">
            <strong>Status do seu acesso:</strong>
          </p>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
            <span className="text-sm font-medium text-blue-900">Solicitação Pendente</span>
          </div>
          <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
            <li>Sua solicitação foi enviada ao administrador</li>
            <li>Você receberá um e-mail quando for aprovado</li>
            <li>Após aprovação, basta recarregar a página</li>
          </ul>
        </div>

        <div>
          <Button
            onClick={() => signOut.mutate()}
            className="w-full bg-slate-900 hover:bg-slate-800"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>

        <p className="text-xs text-center text-slate-500 mt-6">
          E-mail conectado: <strong>{userEmail}</strong>
        </p>
      </Card>
    </div>
  )
}
