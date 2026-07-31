import type { Client } from '@/features/crm/types'

/*
  A cópia do cadastro do cliente para dentro do contrato.

  CONGELAMENTO, NÃO ESPELHO — e a distinção é a regra deste módulo inteiro
  (docs/SCHEMA-PLAN.md, "Cópia congelada do cliente", e os COMMENT de cada coluna
  na migration 0029). O contrato assinado registra o que valia na assinatura:
  cliente que muda de endereço, corrige o CPF ou troca de e-mail depois NÃO
  reescreve o documento que já foi assinado.

  Consequências práticas, e nenhuma delas é detalhe:

  1. A cópia acontece UMA VEZ, ao escolher o cliente num contrato NOVO.
  2. Ao editar um contrato existente, estes campos não se atualizam sozinhos com
     o cadastro. São editáveis à mão, e o valor gravado é o que vale.
  3. Contrato com endereço diferente do cadastro NÃO é inconsistência a
     corrigir. O seed tem esse caso de propósito (FC-2025-104, do Joaquim: o
     cliente mudou de endereço depois de assinar) — se a tela "consertasse" o
     contrato para bater com o cadastro, apagaria qual endereço constava do
     documento.

  O ORIGINAL NÃO FAZ ESTA CÓPIA: em ContractForm.jsx:105 escolher o cliente só
  grava `client_id` e `client_name`, e os dados do cliente são redigitados à mão
  em toda proposta — enquanto Contracts.jsx:215-367 corre no sentido CONTRÁRIO,
  usando o contrato para preencher campo vazio do CRM. Copiar na criação é o que
  o formulário já esperava que alguém fizesse; a decisão está registrada na
  tarefa do módulo.

  Só os campos que o contrato guarda. `address_district` e `site_district` do
  cadastro não têm coluna correspondente em `contracts` (o original também não
  tem bairro no contrato) e ficam de fora — sem inventar campo novo na tela.
*/
export type ClientSnapshot = {
  client_legal_name: string | null
  client_tax_id: string | null
  client_birth_date: string | null
  client_email: string | null
  client_address_zipcode: string | null
  client_address_street: string | null
  client_address_number: string | null
  client_address_complement: string | null
  client_address_city: string | null
  client_address_state: string | null
  site_zipcode: string | null
  site_street: string | null
  site_number: string | null
  site_complement: string | null
  site_city: string | null
  site_state: string | null
}

export function snapshotOfClient(client: Client): ClientSnapshot {
  return {
    client_legal_name: client.name,
    client_tax_id: client.tax_id,
    client_birth_date: client.birth_date,
    client_email: client.email,
    client_address_zipcode: client.address_zipcode,
    client_address_street: client.address_street,
    client_address_number: client.address_number,
    client_address_complement: client.address_complement,
    client_address_city: client.address_city,
    client_address_state: client.address_state,
    site_zipcode: client.site_zipcode,
    site_street: client.site_street,
    site_number: client.site_number,
    site_complement: client.site_complement,
    site_city: client.site_city,
    site_state: client.site_state,
  }
}
