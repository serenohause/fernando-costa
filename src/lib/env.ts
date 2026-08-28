import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),

  /*
    OPCIONAL de propósito, e não esquecida: a chave da Google Geocoding API não
    existe no .env, o app inteiro sobe sem ela e só a geocodificação do endereço
    da obra deixa de funcionar — devolvendo "API Key não configurada", que é
    exatamente o que o original faz (geocoding.jsx:8-11). Exigi-la aqui
    impediria o sistema de abrir por causa de um campo que uma tela mostra.

    `VITE_` significa que ela VAI PARA O BUNDLE do navegador; o que a torna
    segura é a restrição por referenciador HTTP e por API no console do Google.
    O porquê está inteiro no cabeçalho de src/features/map/geocoding.ts.
  */
  VITE_GOOGLE_MAPS_API_KEY: z.string().min(1).optional(),
})

/*
  AS TRÊS CHAVES, NOMEADAS — e não `import.meta.env` inteiro.

  O Vite substitui `import.meta.env` pelo objeto materializado em tempo de build,
  então passar o objeto todo arrasta para o bundle publicado TODA variável `VITE_`
  do ambiente. Na Vercel isso inclui as que ela injeta sozinha: sha do commit,
  mensagem do commit, nome do autor, dono e slug do repositório, id do projeto.
  Foi medido no bundle de produção, não deduzido.

  Nada disso é segredo. É reconhecimento de graça para quem for sondar, e não
  custa nada não entregar.
*/
const parsed = envSchema.safeParse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  /*
    `|| undefined` TRANSFORMA VAZIO EM AUSENTE, e a falta disso derrubou o
    ambiente de teste inteiro.

    `.optional()` aceita a variável NÃO EXISTIR; não aceita ela existir vazia.
    E "existir vazia" é o estado mais comum de uma variável criada num painel:
    alguém abre o formulário, salva o nome sem o valor, e pronto. Foi o que
    aconteceu na Vercel do ambiente de dev — `VITE_GOOGLE_MAPS_API_KEY:``` no
    bundle, `safeParse` falhando, `throw` antes do React montar, tela branca sem
    uma linha de explicação.

    O comentário do schema acima já dizia a intenção: "o app inteiro sobe sem
    ela". Sobe sem ela AUSENTE; não subia sem ela VAZIA. Esta linha faz as duas
    formas de "não tenho essa chave" significarem a mesma coisa.
  */
  VITE_GOOGLE_MAPS_API_KEY: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || undefined,
})

if (!parsed.success) {
  const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')
  throw new Error(
    `Variáveis de ambiente ausentes ou inválidas: ${missing}. Confira o .env.example.`,
  )
}

export const env = parsed.data
