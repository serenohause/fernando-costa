import { Fragment, useEffect, useMemo, useState } from 'react'
import { Save, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import ErrorState from '@/components/shared/ErrorState'
import { useCollaboratorPermissions, useMenus } from '@/features/auth/hooks'
import { applyPreset, GRUPOS_MODULOS, MENUS_SISTEMA, PRESETS } from '../permissions-matrix'
import { useSaveCollaboratorPermissions, describeDatabaseError } from '../hooks'
import type { Collaborator, PermissionDraftMap } from '../types'

/*
  Porta de projeto-original/src/components/collaborators/PermissoesManager.jsx.

  O que muda por baixo, sem mudar a tela: o menu deixa de ser texto livre e vira
  `menus.key` (migration 0004), e o rótulo de cada linha vem de `menus.label_pt`
  — nenhum nome de módulo escrito à mão aqui. A gravação vira um UPSERT único
  em vez de N create/update em Promise.all.
*/
export default function PermissoesManager({
  collaborator,
  isDirector,
  onClose,
}: {
  collaborator: Collaborator
  isDirector: boolean
  onClose?: () => void
}) {
  const menusQuery = useMenus()
  const permissoesQuery = useCollaboratorPermissions(collaborator.id)
  const salvarMutation = useSaveCollaboratorPermissions(collaborator)

  const [permissoes, setPermissoes] = useState<PermissionDraftMap>({})

  const permissoesExistentes = permissoesQuery.data

  useEffect(() => {
    const draft: PermissionDraftMap = {}
    for (const menuKey of MENUS_SISTEMA) {
      const permissao = permissoesExistentes?.find((p) => p.menu_key === menuKey)
      draft[menuKey] = {
        can_view: permissao?.can_view ?? false,
        can_edit: permissao?.can_edit ?? false,
      }
    }
    setPermissoes(draft)
  }, [permissoesExistentes])

  const labelPorChave = useMemo(() => {
    const map: Record<string, string> = {}
    for (const menu of menusQuery.data ?? []) map[menu.key] = menu.label_pt
    return map
  }, [menusQuery.data])

  const handleVisualizarChange = (menuKey: string, checked: boolean) => {
    setPermissoes((prev) => ({
      ...prev,
      [menuKey]: {
        can_view: checked,
        // Se desmarcar visualizar, desmarcar editar também
        can_edit: checked ? (prev[menuKey]?.can_edit ?? false) : false,
      },
    }))
  }

  const handleEditarChange = (menuKey: string, checked: boolean) => {
    // Bloquear se não tiver permissão de visualizar
    if (!permissoes[menuKey]?.can_view && checked) {
      toast.error('É necessário habilitar o acesso antes de gerenciar')
      return
    }

    setPermissoes((prev) => ({
      ...prev,
      [menuKey]: { can_view: prev[menuKey]?.can_view ?? false, can_edit: checked },
    }))
  }

  const aplicarPreset = (presetName: string) => {
    setPermissoes((prev) => applyPreset(prev, presetName))
    toast.success(`Preset "${presetName}" aplicado`)
  }

  const salvar = () => {
    salvarMutation.mutate(permissoes, {
      onSuccess: () => {
        toast.success('O acesso do usuário foi ajustado imediatamente.')
        if (onClose) onClose()
      },
      onError: (error) => {
        toast.error('Erro ao salvar permissões: ' + describeDatabaseError(error))
      },
    })
  }

  if (!isDirector) {
    return null
  }

  const isLoading = permissoesQuery.isLoading || menusQuery.isLoading

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-soft" />
          <h3 className="text-lg font-semibold text-foreground">Controle de Acesso do Usuário</h3>
        </div>
        <p className="text-sm text-soft mb-4">
          Defina exatamente o que este usuário pode visualizar ou gerenciar no sistema.
        </p>
        <div className="animate-pulse space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-border rounded"></div>
          ))}
        </div>
      </Card>
    )
  }

  /* Sem equivalente no original, onde a falha só ia para o console. */
  if (permissoesQuery.isError || menusQuery.isError) {
    return (
      <Card className="p-6">
        <ErrorState
          title="Não foi possível carregar as permissões"
          description="A leitura das permissões deste colaborador falhou. Só o Diretor do escritório enxerga permissão de terceiros."
          error={permissoesQuery.error ?? menusQuery.error}
          onRetry={() => {
            void permissoesQuery.refetch()
            void menusQuery.refetch()
          }}
        />
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-soft" />
            <h3 className="text-lg font-semibold text-foreground">Controle de Acesso do Usuário</h3>
          </div>
          <p className="text-sm text-soft">
            Defina exatamente o que este usuário pode visualizar ou gerenciar no sistema.
          </p>
        </div>
        <Button
          onClick={salvar}
          disabled={salvarMutation.isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Save className="w-4 h-4 mr-2" />
          {salvarMutation.isPending ? 'Salvando...' : 'Salvar Controle de Acesso'}
        </Button>
      </div>

      <div className="mb-6">
        <p className="text-sm font-medium text-soft mb-2">Perfis de Acesso Rápido</p>
        <p className="text-xs text-muted-foreground mb-3">
          Aplicar um perfil padrão acelera a configuração inicial. Você pode personalizar depois.
        </p>
        <div className="flex flex-wrap gap-2">
          {Object.keys(PRESETS).map((presetName) => (
            <Button
              key={presetName}
              variant="outline"
              size="sm"
              onClick={() => aplicarPreset(presetName)}
            >
              {presetName}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-border bg-elevated">
              <th className="text-left py-3 px-4 text-sm font-semibold text-foreground">
                Módulos do Sistema
              </th>
              <th className="text-center py-3 px-4 text-sm font-semibold text-foreground">Acesso</th>
              <th className="text-center py-3 px-4 text-sm font-semibold text-foreground">
                <span className="inline-flex items-center gap-1">
                  Gerenciar
                  <span
                    className="text-xs text-muted-foreground font-normal"
                    title="Inclui criação, edição e exclusão de registros"
                  >
                    ⓘ
                  </span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {GRUPOS_MODULOS.map(({ grupo, menuKeys }) => (
              <Fragment key={grupo}>
                <tr className="bg-muted">
                  <td
                    colSpan={3}
                    className="py-2 px-4 text-xs font-semibold text-soft uppercase tracking-wide"
                  >
                    {grupo}
                  </td>
                </tr>
                {menuKeys.map((menuKey) => (
                  <tr key={menuKey} className="border-b border-border hover:bg-elevated">
                    <td className="py-3 px-4 pl-8 text-sm text-foreground">
                      {labelPorChave[menuKey] ?? menuKey}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Checkbox
                        checked={permissoes[menuKey]?.can_view || false}
                        onCheckedChange={(checked) =>
                          handleVisualizarChange(menuKey, checked === true)
                        }
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Checkbox
                        checked={permissoes[menuKey]?.can_edit || false}
                        disabled={!permissoes[menuKey]?.can_view}
                        onCheckedChange={(checked) => handleEditarChange(menuKey, checked === true)}
                        className={!permissoes[menuKey]?.can_view ? 'opacity-40' : ''}
                      />
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-900">
        <p className="text-xs text-blue-900 dark:text-blue-200">
          <strong>💡 Dica:</strong> A opção "Gerenciar" só pode ser habilitada se "Acesso" estiver
          marcado. Ao desmarcar "Acesso", a permissão de gerenciar será automaticamente removida.
        </p>
      </div>
    </Card>
  )
}
