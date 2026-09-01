import type { Tables, TablesInsert, TablesUpdate } from '@/lib/database.types'

/*
  O tipo de serviço deixou de ser um valor de enum e virou uma LINHA (migration
  0084). A diferença que importa para quem lê este arquivo: a lista muda em
  tempo de execução, por escritório, e nada no TypeScript pode enumerá-la.

  Por isso `key` continua existindo ao lado de `id`: é ela que a importação do
  base44 e o de/para de `docs/ENUM-MAP.md` conhecem, e é ela que se lê num log
  sem precisar de um join.
*/
export type ServiceTypeRow = Tables<'service_types'>
export type ServiceTypeInsert = TablesInsert<'service_types'>
export type ServiceTypeUpdate = TablesUpdate<'service_types'>

export type ServiceContractGroup = ServiceTypeRow['contract_group']
