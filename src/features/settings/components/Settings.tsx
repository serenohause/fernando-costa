import { useState } from 'react'
import { Wrench } from 'lucide-react'
import { useMenuPermissions } from '@/features/auth/hooks'
import ServiceTypesSection from './ServiceTypesSection'

/*
  MÓDULO NOVO, SEM ORIGINAL DE REFERÊNCIA.

  Configurações não existe no base44: é o lugar pedido para o escritório mexer no
  que antes só uma migration mudava. A primeira opção são os tipos de serviço do
  Pipeline (0084) e outras virão — daí a coluna de seções à esquerda desde já, em
  vez de uma tela única que precisaria ser desmontada na segunda opção.

  AUTORIZAÇÃO: quem escreve é `can_edit_menu('settings')`, e quem decide de
  verdade é a RLS de `service_types`. Aqui só se decide o que aparece.
*/
const SECTIONS = [
  {
    key: 'service_types',
    label: 'Tipos de Serviço',
    description: 'Opções de serviço do Pipeline',
    icon: Wrench,
  },
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

export default function Settings() {
  const { canEdit } = useMenuPermissions('settings')
  const [section, setSection] = useState<SectionKey>('service_types')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ajustes do escritório que valem para todo o sistema
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-64 shrink-0">
          <div className="bg-card rounded-xl border border-border p-2 space-y-1">
            {SECTIONS.map((item) => {
              const Icon = item.icon
              const active = item.key === section
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSection(item.key)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-start gap-3 ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-elevated hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="block text-xs text-faint mt-0.5">{item.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </nav>

        <div className="flex-1 min-w-0">
          {section === 'service_types' && <ServiceTypesSection canEdit={canEdit} />}
        </div>
      </div>
    </div>
  )
}
