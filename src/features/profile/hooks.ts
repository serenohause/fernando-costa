import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { describeDatabaseError as describeError, WriteError } from '@/lib/db-errors'
import type { DatabaseErrorMessages } from '@/lib/db-errors'
import { authKeys, useCurrentCollaborator, useSession } from '@/features/auth/hooks'

/*
  O PERFIL DE QUEM ESTÁ LOGADO.

  Duas metades que vivem em lugares diferentes, e é isso que explica a forma
  deste arquivo:

  - nome, telefone e foto são do BANCO (`collaborators`), e a escrita passa por
    `update_own_profile`, que nomeia as três colunas editáveis. A policy de
    UPDATE daquela tabela é de gestor (0009), e RLS não filtra coluna: abrir a
    própria linha deixaria qualquer um se promover a Diretor;
  - a senha é do GOTRUE (`auth.updateUser`) e nunca encosta no Postgres.
*/

export const AVATARS_BUCKET = 'avatars'

/* Uma hora, como as URLs assinadas do módulo 8. A foto fica visível enquanto a
   pessoa usa o sistema, e o link expira sozinho se vazar. */
const SIGNED_URL_TTL_SECONDS = 3600

export const profileKeys = {
  all: ['profile'] as const,
  avatar: (path: string | null | undefined) => [...profileKeys.all, 'avatar', path] as const,
}

const PROFILE_ERROR_MESSAGES: DatabaseErrorMessages = {
  collaborators_name_not_blank_check: 'Informe seu nome.',
  collaborators_phone_length_check: 'O telefone é longo demais (máximo de 30 caracteres).',
  collaborators_avatar_path_format_check:
    'A foto não pôde ser registrada. Tente enviar de novo.',
  '42501': 'Sua sessão não permite editar o perfil. Entre de novo e tente outra vez.',
}

export function describeDatabaseError(error: unknown): string {
  return describeError(error, PROFILE_ERROR_MESSAGES)
}

/*
  A foto vem por URL ASSINADA, e não por URL pública: o bucket é privado
  (migration 0088). O cache dura menos que a assinatura, para a tela nunca
  exibir um link que já venceu.
*/
export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: profileKeys.avatar(path),
    enabled: Boolean(path),
    staleTime: (SIGNED_URL_TTL_SECONDS - 300) * 1000,
    gcTime: (SIGNED_URL_TTL_SECONDS - 60) * 1000,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage
        .from(AVATARS_BUCKET)
        .createSignedUrl(path!, SIGNED_URL_TTL_SECONDS)

      if (error) throw error
      return data.signedUrl
    },
  })
}

type ProfileInput = {
  name: string
  phone: string | null
  avatarPath: string | null
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ProfileInput) => {
      const { data, error } = await supabase
        /*
          `?? undefined` porque o tipo gerado do PostgREST não aceita null em
          parâmetro com default — e omitir É mandar null, que é o default da
          função. Mesmo efeito, inclusive para limpar a foto.
        */
        .rpc('update_own_profile', {
          p_name: input.name,
          p_phone: input.phone ?? undefined,
          p_avatar_path: input.avatarPath ?? undefined,
        })
        .maybeSingle()

      if (error) throw error
      if (!data) throw new WriteError('O perfil não foi atualizado.')
      return data
    },
    onSuccess: () => {
      /* O nome e a foto aparecem na barra lateral, que lê `useCurrentCollaborator`
         — sem esta invalidação, a tela de perfil mostraria o nome novo e o resto
         do sistema continuaria com o antigo até um F5. */
      void queryClient.invalidateQueries({ queryKey: authKeys.all })
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

function avatarObjectPath(
  tenantId: string,
  collaboratorId: string,
  extension: 'webp' | 'jpg',
): string {
  /* Nome de arquivo é uuid, nunca o nome que veio do computador de quem envia:
     nome escolhido por terceiro não entra em caminho de storage. */
  return `${tenantId}/${collaboratorId}/${crypto.randomUUID()}.${extension}`
}

/*
  ENVIAR A FOTO, e apagar a anterior só DEPOIS de a nova estar gravada no
  cadastro. Na ordem inversa, uma falha no meio deixaria a pessoa sem foto
  nenhuma — e o arquivo antigo já teria ido embora.

  O QUE CHEGA AQUI JÁ É O RECORTE COMPRIMIDO (`../image`), e não o arquivo que a
  pessoa escolheu: um quadrado de até 512px, na casa das dezenas de KB. É o que
  permite aceitar a foto de 8 MB do celular sem que o bucket precise aceitar
  8 MB — e sem guardar 8 MB por pessoa.
*/
export function useUploadAvatar() {
  const queryClient = useQueryClient()
  const { data: collaborator } = useCurrentCollaborator()

  return useMutation({
    mutationFn: async ({
      blob,
      extension,
      name,
      phone,
    }: {
      blob: Blob
      extension: 'webp' | 'jpg'
      name: string
      phone: string | null
    }) => {
      if (!collaborator) throw new WriteError('Sessão não identificada.')

      const path = avatarObjectPath(collaborator.tenant_id, collaborator.id, extension)

      const { error: uploadError } = await supabase.storage
        .from(AVATARS_BUCKET)
        .upload(path, blob, { contentType: blob.type, upsert: false })

      if (uploadError) throw uploadError

      const { data, error } = await supabase
        .rpc('update_own_profile', {
          p_name: name,
          p_phone: phone ?? undefined,
          p_avatar_path: path,
        })
        .maybeSingle()

      if (error || !data) {
        /* O cadastro não aceitou o caminho: o objeto recém-enviado não pode
           ficar no bucket sem nada que o mencione. */
        await supabase.storage.from(AVATARS_BUCKET).remove([path])
        if (error) throw error
        throw new WriteError('A foto não foi salva.')
      }

      const previous = collaborator.avatar_path
      if (previous && previous !== path) {
        await supabase.storage.from(AVATARS_BUCKET).remove([previous])
      }

      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.all })
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

export function useRemoveAvatar() {
  const queryClient = useQueryClient()
  const { data: collaborator } = useCurrentCollaborator()

  return useMutation({
    mutationFn: async ({ name, phone }: { name: string; phone: string | null }) => {
      if (!collaborator) throw new WriteError('Sessão não identificada.')

      const { data, error } = await supabase
        /* Sem `p_avatar_path`: o default da função é null, e null é o que
           limpa a foto. */
        .rpc('update_own_profile', { p_name: name, p_phone: phone ?? undefined })
        .maybeSingle()

      if (error) throw error
      if (!data) throw new WriteError('A foto não foi removida.')

      if (collaborator.avatar_path) {
        await supabase.storage.from(AVATARS_BUCKET).remove([collaborator.avatar_path])
      }

      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.all })
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

/*
  TROCAR A SENHA EXIGE A SENHA ATUAL, e o Supabase não pede — `updateUser` troca
  a senha de quem tem uma sessão válida, ponto. Quer dizer: um computador
  deixado aberto vira uma conta tomada, sem que o dono possa recuperá-la.

  A conferência é reautenticar com a senha atual antes de trocar. Não é
  perfeita (quem controla a sessão poderia chamar a API direto), mas fecha o
  caso que acontece de verdade num escritório: alguém sentado na máquina de
  outra pessoa.
*/
export function useChangePassword() {
  const { data: session } = useSession()

  return useMutation({
    mutationFn: async ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string
      newPassword: string
    }) => {
      const email = session?.user?.email
      if (!email) throw new WriteError('Sessão não identificada. Entre de novo.')

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })

      if (reauthError) {
        throw new WriteError('A senha atual está incorreta.')
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        /* A mensagem do GoTrue vem em inglês e às vezes descreve a política de
           senha; a tela já diz a regra, então o texto daqui é o nosso. */
        throw new WriteError('Não foi possível trocar a senha. Tente novamente.')
      }
    },
  })
}
