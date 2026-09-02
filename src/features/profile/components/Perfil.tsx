import { useEffect, useRef, useState } from 'react'
import { Camera, KeyRound, Trash2, UserCircle } from 'lucide-react'
import { toast } from 'sonner'
import ErrorState from '@/components/shared/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MaskedInput } from '@/components/ui/masked-input'
import { useCurrentCollaborator, useSession } from '@/features/auth/hooks'
import { COLLABORATOR_AREA, COLLABORATOR_ROLE, labelOf } from '@/lib/enums'
import { maskPhone } from '@/lib/masks'
import {
  describeDatabaseError,
  useChangePassword,
  useRemoveAvatar,
  useUpdateProfile,
  useUploadAvatar,
} from '../hooks'
import AvatarPicture from './AvatarPicture'
import AvatarCropDialog from './AvatarCropDialog'

/*
  PERFIL DO USUÁRIO — módulo sem correspondente no original.

  Chega-se aqui pelo bloco de usuário no rodapé da barra lateral, e não pelo
  menu: todo mundo edita o próprio perfil, então não há permissão de menu a
  consultar e uma entrada na barra seria uma linha a mais para todos.

  O QUE ESTA TELA NÃO EDITA, e é deliberado: função, área, situação e e-mail.
  Os três primeiros são decisões do escritório sobre a pessoa e vivem na tela de
  Equipe, com o Diretor; o e-mail é a credencial de login e a chave do cadastro
  no escritório — trocá-lo é operação de conta, não de perfil. Aparecem aqui só
  para leitura, porque quem abre o perfil quer conferi-los.
*/

/*
  O TETO DA ESCOLHA É DE SANIDADE, e não o limite do que se guarda: o que sobe é
  sempre o recorte comprimido pelo navegador (`../image`), na casa das dezenas
  de KB. 25 MB é o ponto em que decodificar a imagem começa a travar a aba de
  quem escolheu o arquivo errado — um vídeo, um PSD.
*/
const MAX_PICK_BYTES = 25 * 1024 * 1024

/*
  Aceita o que o navegador sabe decodificar, e não só os três tipos que o bucket
  guarda: o recorte SAI em WebP ou JPEG de qualquer forma. Restringir a entrada
  a esses três recusaria um PNG grande que o sistema converteria sem problema.
*/
const ACCEPTED_PICK_TYPES = 'image/*'

/* O mesmo mínimo que o Supabase aplica por padrão. Dizer antes evita a recusa
   do servidor em inglês depois de a pessoa digitar duas vezes. */
const MIN_PASSWORD = 6

export default function Perfil() {
  const collaboratorQuery = useCurrentCollaborator()
  const sessionQuery = useSession()
  const collaborator = collaboratorQuery.data ?? null

  const updateProfile = useUpdateProfile()
  const uploadAvatar = useUploadAvatar()
  const removeAvatar = useRemoveAvatar()
  const changePassword = useChangePassword()

  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)

  /* Os campos nascem com o que está gravado, e voltam a nascer quando a
     gravação devolve valores novos — sem isto, salvar e continuar na tela
     deixaria o formulário mostrando o que foi digitado, e não o que ficou. */
  useEffect(() => {
    if (!collaborator) return
    setName(collaborator.name)
    setPhone(collaborator.phone ?? '')
  }, [collaborator])

  if (collaboratorQuery.isError) {
    return (
      <ErrorState
        title="Não foi possível carregar seu perfil"
        description="Seus dados não puderam ser lidos agora."
        error={collaboratorQuery.error}
        onRetry={() => {
          void collaboratorQuery.refetch()
        }}
      />
    )
  }

  if (collaboratorQuery.isLoading || !collaborator) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-muted rounded-xl animate-pulse" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    )
  }

  const phoneDigits = phone.replace(/\D/g, '')
  const dirty = name.trim() !== collaborator.name || phone !== (collaborator.phone ?? '')

  const handleSave = () => {
    if (name.trim() === '') {
      toast.error('Informe seu nome.')
      return
    }

    updateProfile.mutate(
      {
        name: name.trim(),
        phone: phoneDigits === '' ? null : phone.trim(),
        /* O CAMINHO ATUAL VIAJA JUNTO: a função grava as três colunas de uma
           vez, e omitir a foto aqui a apagaria a cada "salvar". */
        avatarPath: collaborator.avatar_path,
      },
      {
        onSuccess: () => toast.success('Perfil atualizado'),
        onError: (error) => toast.error('Erro ao salvar: ' + describeDatabaseError(error)),
      },
    )
  }

  /* Escolher o arquivo não envia nada: abre o recorte. Quem confirma é o
     diálogo, com a imagem já ajustada e comprimida. */
  const handlePickFile = (file: File | undefined) => {
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Escolha um arquivo de imagem.')
      return
    }
    if (file.size > MAX_PICK_BYTES) {
      toast.error('Essa imagem é grande demais para abrir. Use uma de até 25 MB.')
      return
    }

    setCropFile(file)
  }

  const handleConfirmCrop = (blob: Blob, extension: 'webp' | 'jpg') => {
    uploadAvatar.mutate(
      {
        blob,
        extension,
        name: name.trim() || collaborator.name,
        phone: phoneDigits === '' ? null : phone,
      },
      {
        onSuccess: () => {
          setCropFile(null)
          toast.success('Foto atualizada')
        },
        onError: (error) => toast.error('Erro ao enviar a foto: ' + describeDatabaseError(error)),
      },
    )
  }

  const handleChangePassword = () => {
    setPasswordError(null)

    if (newPassword.length < MIN_PASSWORD) {
      setPasswordError(`A nova senha precisa ter ao menos ${MIN_PASSWORD} caracteres.`)
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('A confirmação não confere com a nova senha.')
      return
    }
    if (newPassword === currentPassword) {
      setPasswordError('A nova senha precisa ser diferente da atual.')
      return
    }

    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword('')
          setNewPassword('')
          setConfirmPassword('')
          toast.success('Senha alterada')
        },
        onError: (error) =>
          setPasswordError(
            error instanceof Error ? error.message : 'Não foi possível trocar a senha.',
          ),
      },
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Meu Perfil</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Seus dados, sua foto e sua senha.
        </p>
      </div>

      {/* ── Identificação ─────────────────────────────────────────────── */}
      <section className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-4">
          <AvatarPicture avatarPath={collaborator.avatar_path} name={collaborator.name} size={72} />

          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground truncate">{collaborator.name}</p>
            <p className="text-sm text-muted-foreground truncate">{collaborator.email}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline" className="bg-elevated">
                {labelOf(COLLABORATOR_ROLE, collaborator.role)}
              </Badge>
              {collaborator.area && (
                <Badge variant="outline" className="bg-elevated">
                  {labelOf(COLLABORATOR_AREA, collaborator.area)}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_PICK_TYPES}
              className="hidden"
              onChange={(event) => {
                handlePickFile(event.target.files?.[0])
                /* Zera o input: escolher o MESMO arquivo duas vezes seguidas não
                   dispara `change`, e a segunda tentativa não faria nada. */
                event.target.value = ''
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="w-4 h-4 mr-2" />
              Trocar foto
            </Button>
            {collaborator.avatar_path && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={removeAvatar.isPending}
                onClick={() =>
                  removeAvatar.mutate(
                    {
                      name: name.trim() || collaborator.name,
                      phone: phoneDigits === '' ? null : phone,
                    },
                    {
                      onSuccess: () => toast.success('Foto removida'),
                      onError: (error) =>
                        toast.error('Erro ao remover: ' + describeDatabaseError(error)),
                    },
                  )
                }
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remover
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-faint mt-3">
          Qualquer imagem até 25 MB — o sistema recorta e comprime antes de enviar.
        </p>
      </section>

      <AvatarCropDialog
        file={cropFile}
        onCancel={() => setCropFile(null)}
        onConfirm={handleConfirmCrop}
        isSaving={uploadAvatar.isPending}
      />

      {/* ── Dados pessoais ────────────────────────────────────────────── */}
      <section className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <UserCircle className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-medium text-foreground">Dados pessoais</h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Nome *</Label>
            <Input
              id="profile-name"
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-phone">Telefone</Label>
            <MaskedInput
              id="profile-phone"
              mask={maskPhone}
              value={phone}
              onValueChange={setPhone}
              placeholder="(62) 99999-9999"
            />
          </div>
        </div>

        {/*
          FUNÇÃO, ÁREA, SITUAÇÃO E E-MAIL NÃO SE EDITAM AQUI, e a frase explica
          para quem procurar. São decisões do escritório sobre a pessoa (Equipe,
          com o Diretor) ou credencial de login.
        */}
        <p className="text-xs text-muted-foreground">
          Função, área e e-mail são mantidos pela direção do escritório, na tela de Equipe.
        </p>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || updateProfile.isPending}>
            {updateProfile.isPending ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </div>
      </section>

      {/* ── Senha ─────────────────────────────────────────────────────── */}
      <section className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-medium text-foreground">Senha</h2>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Senha atual *</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Nova senha *</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar *</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
        </div>

        {passwordError && (
          <p role="alert" className="text-sm text-destructive">
            {passwordError}
          </p>
        )}

        {/* A senha atual é pedida porque o Supabase NÃO pede: `updateUser` troca
            a senha de quem tem sessão válida. Sem esta conferência, computador
            deixado aberto vira conta tomada. */}
        <p className="text-xs text-muted-foreground">
          Pedimos a senha atual para confirmar que é você. Mínimo de {MIN_PASSWORD} caracteres na
          nova senha.
        </p>

        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={handleChangePassword}
            disabled={
              changePassword.isPending ||
              currentPassword === '' ||
              newPassword === '' ||
              confirmPassword === ''
            }
          >
            {changePassword.isPending ? 'Alterando...' : 'Alterar senha'}
          </Button>
        </div>

        {sessionQuery.data?.user?.email && (
          <p className="text-xs text-faint">
            Conta: <span className="font-mono">{sessionQuery.data.user.email}</span>
          </p>
        )}
      </section>
    </div>
  )
}
