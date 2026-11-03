import { useState } from 'react'
import { Eye, EyeOff, Link2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { AMBIENTE_LABEL, type AsaasEnvironment } from '../conexao'
import AsaasFaixa from './AsaasFaixa'

/*
  O CORPO DO BLOCO QUANDO NÃO HÁ CONEXÃO.

  Diferente do Google Agenda, aqui a conexão não é consentimento em outro site:
  é uma chave colada. Por isso o corpo do bloco carrega um formulário, e por
  isso a chave sai deste componente direto para a Edge Function — ela não vai
  para o React Query, não vai para contexto e não volta depois.

  O SELETOR DE AMBIENTE É UM PAR DE CARTÕES DE RÁDIO, e não um <Select>: lista
  fechada esconde a opção não escolhida, e a opção não escolhida é justamente a
  que cobra dinheiro de verdade.
*/
const AMBIENTES: { value: AsaasEnvironment; nome: string; sobre: string }[] = [
  {
    value: 'sandbox',
    nome: 'Sandbox',
    sobre: 'Conta de teste. Nenhuma cobrança chega a cliente nenhum.',
  },
  {
    value: 'production',
    nome: 'Produção',
    sobre: 'Conta real. O cliente recebe a cobrança e o dinheiro cai no caixa do escritório.',
  },
]

export default function AsaasConectarForm({
  canEdit,
  onConnect,
  isPending,
}: {
  canEdit: boolean
  onConnect: (input: { apiKey: string; environment: AsaasEnvironment }) => void
  isPending: boolean
}) {
  const [apiKey, setApiKey] = useState('')
  const [revelada, setRevelada] = useState(false)
  const [environment, setEnvironment] = useState<AsaasEnvironment>('sandbox')

  /*
    SEM PERMISSÃO DE EDIÇÃO, O FORMULÁRIO NÃO APARECE — e a frase é a mesma do
    bloco do Google Agenda, porque a situação é a mesma: as três Edge Functions
    exigem `can_edit` no menu `settings`, e campo que o servidor vai recusar é
    convite para perder tempo. O protótipo não desenhou este caso.
  */
  if (!canEdit) {
    return (
      <div className="mt-4">
        <p className="text-sm text-muted-foreground">
          A conexão é feita uma vez, com a chave de API da conta Asaas do escritório. A chave fica
          no painel do Asaas, em Integrações, API Key.
        </p>
        <p className="text-sm text-faint mt-3">
          Peça a um Diretor para conectar a conta do escritório.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        A conexão é feita uma vez, com a chave de API da conta Asaas do escritório. A chave fica no
        painel do Asaas, em Integrações, API Key.
      </p>

      <div>
        <Label htmlFor="asaas-api-key" className="block mb-2">
          Chave de API
        </Label>
        {/*
          A chave fica em campo mascarado com botão de mostrar: colar chave em
          campo de senha é o normal, e conferir visualmente o que foi colado
          importa mais do que esconder da sala.
        */}
        <div className="flex items-center gap-2">
          <Input
            id="asaas-api-key"
            type={revelada ? 'text' : 'password'}
            className="font-mono"
            value={apiKey}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <Button
            variant="outline"
            size="icon"
            type="button"
            aria-label={revelada ? 'Ocultar a chave digitada' : 'Mostrar a chave digitada'}
            onClick={() => setRevelada((atual) => !atual)}
          >
            {revelada ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          A chave vai para um cofre na hora de salvar e não volta a aparecer, nem para quem a
          digitou. Para trocá-la, é preciso conectar de novo.
        </p>
      </div>

      <div>
        <span id="asaas-env-label" className="block text-sm font-medium mb-2">
          Ambiente
        </span>
        <RadioGroup
          aria-labelledby="asaas-env-label"
          value={environment}
          onValueChange={(value) => setEnvironment(value as AsaasEnvironment)}
          className="gap-2 min-[30rem]:grid-cols-2"
        >
          {AMBIENTES.map((ambiente) => (
            <Label
              key={ambiente.value}
              htmlFor={`asaas-env-${ambiente.value}`}
              className={cn(
                'flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer font-normal leading-normal',
                /* O cartão escolhido NÃO muda no hover: no protótipo a regra do
                   `:has(input:checked)` vence a de `:hover`, e perder o realce
                   do escolhido ao passar o mouse apagaria justamente a resposta
                   da pergunta "qual ambiente está selecionado?". */
                environment === ambiente.value
                  ? 'border-foreground/45 bg-elevated'
                  : 'border-border bg-card hover:bg-accent',
              )}
            >
              <RadioGroupItem
                id={`asaas-env-${ambiente.value}`}
                value={ambiente.value}
                className="mt-[0.1875rem]"
              />
              <span>
                <span className="block text-sm font-medium">{ambiente.nome}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">{ambiente.sobre}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </div>

      {/*
        A FAIXA ÂMBAR APARECE SÓ EM PRODUÇÃO. Em Sandbox não há nada a avisar, e
        aviso permanente treina o olho a ignorar a faixa.
      */}
      {environment === 'production' && (
        <AsaasFaixa
          tone="warn"
          icon={TriangleAlert}
          title="Conta real selecionada"
          text="Daqui para frente, toda cobrança gerada nos Recebíveis é cobrança de verdade: o cliente recebe o link e o pagamento entra na conta do escritório."
        />
      )}

      {/*
        O BOTÃO DIZ O AMBIENTE. É a última linha de defesa contra colar a chave
        de produção achando que é a de teste, e fica no lugar onde o olho está no
        momento do clique.
      */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => onConnect({ apiKey, environment })}
          disabled={isPending || apiKey.trim() === ''}
        >
          <Link2 className="w-4 h-4" />
          Conectar em {AMBIENTE_LABEL[environment]}
        </Button>
      </div>
    </div>
  )
}
