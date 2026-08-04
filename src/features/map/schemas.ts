import { z } from 'zod'
import { Constants } from '@/lib/database.types'

/*
  Segunda barreira antes de qualquer escrita em `map_properties` e nas duas
  tabelas de tag. A primeira continua sendo o que a marcação impede, como no
  original — mesma mecânica dos módulos 2 a 8, e pelo mesmo motivo: o que o
  navegador deixa passar e o banco recusaria vira frase em português aqui, e não
  nome de constraint na tela.

  As regras saem dos checks da migration 0057, e TODAS descrevem estados que o
  base44 aceita hoje:

  1. `map_properties_lat_range_check` / `_lng_range_check` — coordenada fora do
     planeta. O original valida a faixa antes de aceitar coordenada DIGITADA na
     busca (MapaProjetos.jsx:583) e não valida nada antes de GRAVAR.
  2. `map_properties_not_null_island_check` — o par (0,0).
  3. `map_properties_project_link_exclusive_check` / `_client_link_exclusive_check`
     — vínculo e rótulo livre preenchidos ao mesmo tempo. O combobox do original
     zera um ao gravar o outro (ProjectForm.jsx:174 e :199), então a exclusividade
     é a regra dele; o que falta lá é quem a garanta quando o dado chega por
     outro caminho.
  4. `map_properties_project_label_not_blank_check` / `_client_label_not_blank_check`
     — rótulo só com espaço, que `nullIfBlank` transforma em nulo antes.
  5. `map_properties_areas_positive_check` — área zero ou negativa. O
     `<input type="number" min="0">` do original aceita 0 e o `parseFloat` manda.

  E duas regras que são do BANCO sem serem check:
  `map_property_land_types_property_id_land_type_key` e a irmã de finalidade — a
  mesma tag não entra duas vezes na mesma propriedade. Ver `tagList` abaixo.
*/

function nullIfBlank<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return value ?? null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }, schema)
}

const optionalText = (max: number) => nullIfBlank(z.string().max(max).nullable())

/*
  ÁREA: `numeric(12,2)`, positiva, no máximo duas casas.

  As duas casas são cobradas pelo mesmo motivo dos módulos 7 e 8: `numeric(12,2)`
  arredonda o que passar disso EM SILÊNCIO. Nulo é "não informado" e é diferente
  de zero — que o check recusa de propósito, porque terreno de 0 m² não existe.
*/
const area = (message: string) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value ?? null
      const trimmed = value.trim()
      return trimmed === '' ? null : Number(trimmed)
    },
    z
      .number(message)
      .positive('A área precisa ser maior que zero.')
      .max(9_999_999_999.99, 'Área fora da faixa aceita.')
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
        message: 'A área tem no máximo duas casas decimais.',
      })
      .nullable(),
  )

/*
  AS TAGS, normalizadas antes de gravar. Serve para tipo de terreno e para
  finalidade — as duas tabelas têm a mesma forma e o mesmo unique.

  Três coisas acontecem aqui, e as três são consequência de os arrays terem
  virado linha (migration 0057), exatamente como em `brands` no módulo 8:

  1. Espaço nas pontas sai, e tag em branco some. `addCustomTerrenoTipo` já apara
     (ProjectForm.jsx:271), mas o `toggle` dos valores sugeridos não olha nada e a
     importação pode trazer " ".
  2. REPETIDA SOME. `addCustomTerrenoTipo` empurra no array sem conferir o que já
     está lá (:273) — no original isso dobra a propriedade na contagem do filtro
     (MapaProjetos.jsx:1006); aqui bateria no unique e derrubaria a gravação
     inteira por causa de um clique duplo.
  3. A comparação é EXATA, como a do banco: "Terreno" e "terreno" continuam sendo
     duas tags. Achatar caixa aqui esconderia o que a pessoa digitou e ainda
     assim não impediria nada do lado do Postgres.
*/
const tagList = z.preprocess(
  (value) => {
    if (!Array.isArray(value)) return []
    const seen = new Set<string>()
    const unique: string[] = []
    for (const item of value) {
      if (typeof item !== 'string') continue
      const tag = item.trim()
      if (tag === '' || seen.has(tag)) continue
      seen.add(tag)
      unique.push(tag)
    }
    return unique
  },
  z.array(z.string().max(120, 'Nome de categoria longo demais.')),
)

export const mapPropertyInputSchema = z
  .object({
    /*
      Vínculo e rótulo são ALTERNATIVAS, e o `refine` abaixo é quem cobra isso.
      Nulos os quatro é estado válido e comum: é o pino do terreno que o
      escritório está de olho, sem projeto e sem cliente.
    */
    project_id: nullIfBlank(z.uuid('Projeto inválido.').nullable()),
    project_label: optionalText(300),
    client_id: nullIfBlank(z.uuid('Cliente inválido.').nullable()),
    client_label: optionalText(300),

    /* Endereço de exibição em duas linhas, e não endereço estruturado — cidade e
       estado têm coluna própria porque são o que o filtro usa. */
    address: optionalText(500),

    land_types: tagList,
    purposes: tagList,

    land_area_m2: area('Informe a área do terreno.'),
    project_area_m2: area('Informe a área do projeto.'),

    subdivision_name: optionalText(200),
    subdivision_block: optionalText(60),
    subdivision_lot: optionalText(60),

    visual_status: z.enum(Constants.public.Enums.map_visual_status),
  })
  .refine((value) => value.project_id == null || value.project_label == null, {
    message: 'Escolha um projeto da lista OU digite um nome livre — não os dois.',
    path: ['project_label'],
  })
  .refine((value) => value.client_id == null || value.client_label == null, {
    message: 'Escolha um cliente da lista OU digite um nome livre — não os dois.',
    path: ['client_label'],
  })

export type MapPropertyInputParsed = z.infer<typeof mapPropertyInputSchema>

/*
  A COORDENADA DO PINO, com a validação do ORIGINAL — que é mais estrita e mais
  errada que a do banco, e fica assim de propósito.

  MapaProjetos.jsx:386 e :532 recusam `lat === 0 || lng === 0`. Latitude zero é a
  linha do Equador, que corta o Amapá: a regra recusa um pino legítimo em Macapá.
  O check do banco (`map_properties_not_null_island_check`) recusa só o PAR
  (0,0), que é sentinela e não lugar — a migration 0057 registra a divergência no
  COMMENT da constraint e diz, com todas as letras, que a validação da tela não
  foi alterada. A instrução deste módulo é fidelidade ao original; corrigir aqui
  seria decidir sozinho. Está reportado ao usuário.

  O ARREDONDAMENTO PARA SEIS CASAS também é do original (`toFixed(6)`, :383) e
  não é cosmético: `numeric(9,6)` arredondaria em silêncio, e seis casas valem
  cerca de 11 cm no equador.

  A MENSAGEM é parâmetro porque o original tem DUAS, uma por contexto: mover o
  pino pede "Reposicione o pin", criar pede "Clique novamente no mapa".
*/
const coordinate = (message: string) =>
  z.number(message).refine(Number.isFinite, message)

function withPinRules<T extends { lat: number; lng: number }>(
  schema: z.ZodType<T>,
  invalidMessage: string,
) {
  return schema
    .transform((value) => ({
      ...value,
      lat: Number(value.lat.toFixed(6)),
      lng: Number(value.lng.toFixed(6)),
    }))
    .refine((value) => value.lat !== 0 && value.lng !== 0, invalidMessage)
    .refine(
      (value) =>
        value.lat >= -90 && value.lat <= 90 && value.lng >= -180 && value.lng <= 180,
      invalidMessage,
    )
}

const MOVED_PIN_MESSAGE = 'Localização inválida. Reposicione o pin.'
const NEW_PIN_MESSAGE = 'Localização inválida. Clique novamente no mapa.'

export const movedPinPositionSchema = withPinRules(
  z.object({
    lat: coordinate(MOVED_PIN_MESSAGE),
    lng: coordinate(MOVED_PIN_MESSAGE),
  }),
  MOVED_PIN_MESSAGE,
)

/*
  O pino NOVO chega com a coordenada do clique E com o que o Nominatim devolveu,
  e os três textos passam por `nullIfBlank` de propósito.

  O original grava `address: modalData.address || ''` (MapaProjetos.jsx:546), ou
  seja, STRING VAZIA quando o reverse geocoding não achou nada — e faz o mesmo
  com cidade e estado. Aqui isso vira NULO, que é a diferença entre "não
  sabemos" e "o nome é vazio": `city` tem índice parcial `where city is not null`
  (migration 0057) e o filtro de cidade da tela pula o valor falso nos dois
  casos, então a tela não muda e o índice deixa de indexar não-cidade.
*/
export const newPinLocationSchema = withPinRules(
  z.object({
    lat: coordinate(NEW_PIN_MESSAGE),
    lng: coordinate(NEW_PIN_MESSAGE),
    address: optionalText(500),
    city: optionalText(120),
    state: optionalText(60),
  }),
  NEW_PIN_MESSAGE,
)

/* ── Respostas de API externa ──────────────────────────────────────────── */

/*
  Tudo o que vem de fora passa por aqui antes de encostar na tela ou no banco —
  mesmo tratamento que `viaCepResponseSchema` (módulo 2) dá ao ViaCEP.

  O original espalha `data.address` e `data.results[0].geometry.location` direto
  no estado e no `update`, sem conferir tipo algum. Uma resposta fora do formato
  (erro de cota, HTML de portal cativo, mudança de contrato da API) viraria
  `undefined` gravado como coordenada.
*/

/* https://developers.google.com/maps/documentation/geocoding — só o que
   geocoding.jsx lê. */
export const googleGeocodeResponseSchema = z.object({
  status: z.string(),
  results: z
    .array(
      z.object({
        geometry: z.object({
          location: z.object({ lat: z.number(), lng: z.number() }),
        }),
        place_id: z.string().nullish(),
        formatted_address: z.string().nullish(),
      }),
    )
    .default([]),
})

/*
  O bloco `address` do Nominatim. Campo nenhum é garantido: o que existe depende
  do que o OpenStreetMap tem naquele ponto, e `formatCleanAddress` já é escrito
  em cima dessa incerteza (uma cadeia de `||` por linha do endereço).
*/
export const nominatimAddressSchema = z.object({
  road: z.string().nullish(),
  street: z.string().nullish(),
  route: z.string().nullish(),
  house_number: z.string().nullish(),
  neighbourhood: z.string().nullish(),
  suburb: z.string().nullish(),
  sublocality: z.string().nullish(),
  city: z.string().nullish(),
  town: z.string().nullish(),
  municipality: z.string().nullish(),
  village: z.string().nullish(),
  locality: z.string().nullish(),
  state: z.string().nullish(),
  region: z.string().nullish(),
  administrative_area_level_1: z.string().nullish(),
  country: z.string().nullish(),
})

export const nominatimReverseResponseSchema = z.object({
  address: nominatimAddressSchema.nullish(),
})

/*
  `lat` e `lon` chegam como STRING no Nominatim, e o original converte com
  `parseFloat` na hora de usar (MapaProjetos.jsx:635). `boundingbox` é um array
  de quatro strings, na ordem sul, norte, oeste, leste.
*/
export const nominatimSearchResultSchema = z.object({
  lat: z.string(),
  lon: z.string(),
  display_name: z.string(),
  type: z.string().nullish(),
  class: z.string().nullish(),
  addresstype: z.string().nullish(),
  boundingbox: z.array(z.string()).nullish(),
})

export const nominatimSearchResponseSchema = z.array(nominatimSearchResultSchema)
