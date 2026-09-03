import { z } from 'zod'
import { Constants } from '@/lib/database.types'

/*
  Segunda barreira antes de qualquer escrita em `clients`. A primeira continua
  sendo o `required` do HTML, como no original — a marcação é a mesma, campo por
  campo. O que o navegador deixa passar e o banco recusaria vira mensagem em
  português aqui, e não nome de constraint na tela.

  Três regras deste schema saem direto dos COMMENT da migration 0015:

  1. TEXTO VAZIO VIRA NULL, NÃO ''. `clients_email_format_check` recusa string
     vazia e recusa espaço nas pontas; os checks `*_not_blank` recusam campo
     obrigatório em branco. E o formulário do original inicializa TODO campo como
     '', então o caso não é hipotético: sem esta conversão, criar cliente sem
     e-mail seria 23514 na cara do usuário.

  2. DOCUMENTO É OPCIONAL (decisão do usuário, e é o que o original faz).
     Obrigatórios: nome, telefone, cidade, estado e país. Lead que chega pelo
     Instagram não traz CPF, e exigir na entrada travaria o cadastro justamente
     onde ele é mais útil.

  3. COLUNA GERADA NÃO ENTRA. Não há campo para `tax_id_digits`,
     `email_normalized`, `client_key` nem `search_text` — e como objeto Zod
     descarta chave desconhecida, o que passar por aqui está limpo por
     construção, não por disciplina de quem chama.
*/

/*
  Converte '' (e só-espaço) em null ANTES de validar. Sem o preprocess, o
  `.nullable()` cobriria null mas não a string vazia, que é o que o formulário
  realmente manda.
*/
function nullIfBlank<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return value ?? null
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }, schema)
}

const optionalText = (max: number) => nullIfBlank(z.string().max(max).nullable())

const requiredText = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max)

export const clientInputSchema = z.object({
  name: requiredText(200, 'Informe o nome do cliente.'),
  /* No original o rótulo é "Telefone/WhatsApp" e é obrigatório: é o canal do escritório. */
  phone: requiredText(50, 'Informe o telefone do cliente.'),
  email: nullIfBlank(z.email('Informe um e-mail válido.').max(200).nullable()),
  client_type: nullIfBlank(z.enum(Constants.public.Enums.client_type).nullable()),
  lead_source: nullIfBlank(z.enum(Constants.public.Enums.lead_source).nullable()),
  /*
    Quem indicou. O BANCO não exige que só exista com lead_source = referral, e
    o motivo está no COMMENT da coluna (migration 0082, herdado da 0022): check
    ali transformaria "troquei a origem de um cadastro antigo" em erro de
    gravação. Quem exige o preenchimento é a tela, no momento em que a origem
    escolhida é Indicação — e é ela também que limpa o campo quando a origem
    deixa de ser essa.
  */
  referrer_name: optionalText(200),
  /*
    O cliente que indicou, quando quem indicou é cliente do escritório (0087).
    A existência dele e o recorte por escritório são da FK composta; aqui só se
    confere que é um uuid, para texto solto não chegar ao banco como erro 22P02.
  */
  referrer_client_id: nullIfBlank(z.uuid('Indicador inválido.').nullable()),

  /*
    Empresa (0091). Os tetos são os dos checks da coluna; a UF tem dois
    caracteres como em todo o resto do cadastro. Quem exige que estes campos só
    existam num cliente PJ é a tela — o banco não tem check para isso, pelo
    mesmo motivo de `referrer_name`: trocar o tipo de um cadastro antigo viraria
    erro de gravação em vez de campo limpo.
  */
  company_legal_name: optionalText(200),
  company_trade_name: optionalText(200),
  company_state_registration: optionalText(30),
  company_address_zipcode: optionalText(20),
  company_address_street: optionalText(200),
  company_address_number: optionalText(20),
  company_address_complement: optionalText(100),
  company_address_district: optionalText(100),
  company_address_city: optionalText(100),
  company_address_state: optionalText(2),
  /*
    Guardado como a pessoa digitou, com pontuação. Sem check de dígito
    verificador, como no original e como a migration 0015 registra: a comparação
    acontece sempre por `tax_id_digits`, e documento parcial não pode derrubar o
    cadastro nem a importação.
  */
  tax_id: optionalText(30),
  /* `<input type="date">` entrega 'YYYY-MM-DD', que é o que a coluna `date` espera. */
  birth_date: nullIfBlank(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento inválida.')
      .nullable(),
  ),
  notes: optionalText(5000),

  address_zipcode: optionalText(20),
  address_street: optionalText(200),
  address_number: optionalText(20),
  address_district: optionalText(120),
  address_complement: optionalText(120),
  address_city: requiredText(120, 'Informe a cidade.'),
  address_state: requiredText(60, 'Informe o estado.'),
  address_country: requiredText(60, 'Informe o país.'),

  site_zipcode: optionalText(20),
  site_street: optionalText(200),
  site_number: optionalText(20),
  site_district: optionalText(120),
  site_complement: optionalText(120),
  site_city: optionalText(120),
  site_state: optionalText(60),
})

export type ClientInputParsed = z.infer<typeof clientInputSchema>

/*
  Resposta do ViaCEP. É entrada externa e não confiável: o original faz
  `data.logradouro || prev...` direto no `setFormData`, sem conferir tipo algum.
  Aqui o que não casar com o formato é descartado, e o CEP simplesmente não
  preenche nada — mesmo efeito visível que o original tem quando o CEP não existe.

  `erro` vem como boolean em algumas respostas e como a string "true" em outras.
*/
/*
  A resposta da BrasilAPI para uma consulta de CNPJ, recortada ao que o cadastro
  usa. Ela devolve 48 campos; declarar os oito que interessam é o que impede
  que a tela passe a depender, sem querer, de algo que a API mude amanhã.

  TUDO OPCIONAL de propósito: empresa sem nome fantasia é comum, e endereço
  incompleto acontece. Campo ausente vira campo vazio no formulário, nunca
  quebra a consulta inteira.
*/
export const brasilApiCnpjResponseSchema = z.object({
  razao_social: z.string().optional(),
  nome_fantasia: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  municipio: z.string().optional(),
  uf: z.string().optional(),
  /* Mostrados na tela e NÃO gravados: os dois envelhecem, e um contrato
     afirmando "ATIVA" com base numa consulta antiga seria uma mentira com
     data. Ver o cabeçalho da migration 0091. */
  descricao_situacao_cadastral: z.string().optional(),
  cnae_fiscal_descricao: z.string().optional(),
})

export const viaCepResponseSchema = z.object({
  logradouro: z.string().optional(),
  bairro: z.string().optional(),
  localidade: z.string().optional(),
  uf: z.string().optional(),
  erro: z.union([z.boolean(), z.string()]).optional(),
})
