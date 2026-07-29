import { Route, Routes } from 'react-router'

/*
  Rotas reais entram junto com cada módulo. Ver a ordem em
  docs/ARCHITECTURE.md.
*/
export function AppRoutes() {
  return (
    <Routes>
      <Route path="*" element={<Placeholder />} />
    </Routes>
  )
}

function Placeholder() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-8">
      <p className="text-sm text-muted-foreground">
        Scaffold pronto. As telas entram módulo a módulo.
      </p>
    </div>
  )
}
