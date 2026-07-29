/*
  Tipos gerados do schema do Supabase.

  Regenerar após cada migration:
    npx supabase gen types typescript --local > src/lib/database.types.ts

  Enquanto a primeira migration não existe, o tipo é vazio — o client do
  Supabase funciona, só não oferece autocomplete de tabela.
*/
export type Database = Record<string, never>
