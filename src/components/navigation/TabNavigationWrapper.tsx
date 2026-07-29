import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { useLocation, useNavigate } from 'react-router'

type TabState = {
  history: string[]
  scrollPositions: Record<string, number>
  currentIndex: number
}

type TabStates = Record<string, TabState>

type TabNavigationContextValue = {
  scrollContainerRef: RefObject<HTMLElement | null>
  canGoBack: boolean
  goBack: () => void
}

const TabNavigationContext = createContext<TabNavigationContextValue | null>(null)

export function useTabNavigation() {
  return useContext(TabNavigationContext)!
}

export default function TabNavigationWrapper({
  children,
  currentTab,
}: {
  children: ReactNode
  currentTab: string
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const scrollContainerRef = useRef<HTMLElement | null>(null)

  // Store navigation state per tab
  const [tabStates, setTabStates] = useState<TabStates>(() => {
    const saved = sessionStorage.getItem('tabNavigationStates')
    return saved
      ? JSON.parse(saved)
      : {
          Dashboard: { history: ['/Dashboard'], scrollPositions: {}, currentIndex: 0 },
          Clients: { history: ['/Clients'], scrollPositions: {}, currentIndex: 0 },
          Tasks: { history: ['/Tasks'], scrollPositions: {}, currentIndex: 0 },
          Projects: { history: ['/Projects'], scrollPositions: {}, currentIndex: 0 },
        }
  })

  const currentTabState = tabStates[currentTab] || {
    history: [],
    scrollPositions: {},
    currentIndex: 0,
  }

  // Save scroll position before leaving
  useEffect(() => {
    const saveScrollPosition = () => {
      if (scrollContainerRef.current && currentTab) {
        const scrollTop = scrollContainerRef.current.scrollTop
        setTabStates((prev) => {
          const newState = {
            ...prev,
            [currentTab]: {
              ...prev[currentTab],
              scrollPositions: {
                ...prev[currentTab]?.scrollPositions,
                [location.pathname]: scrollTop,
              },
            },
          }
          sessionStorage.setItem('tabNavigationStates', JSON.stringify(newState))
          return newState
        })
      }
    }

    return saveScrollPosition
  }, [location.pathname, currentTab])

  // Restore scroll position when returning to a route
  useEffect(() => {
    if (scrollContainerRef.current && currentTab) {
      const savedPosition = currentTabState.scrollPositions?.[location.pathname] || 0
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = savedPosition
        }
      })
    }
  }, [location.pathname, currentTab])

  // Update tab history when navigating
  useEffect(() => {
    if (!currentTab) return

    setTabStates((prev) => {
      const tabState = prev[currentTab] || { history: [], scrollPositions: {}, currentIndex: 0 }
      const currentPath = location.pathname

      // If this is a new navigation (not back/forward)
      if (tabState.history[tabState.currentIndex] !== currentPath) {
        // Remove forward history and add new route
        const newHistory = [...tabState.history.slice(0, tabState.currentIndex + 1), currentPath]
        const newState = {
          ...prev,
          [currentTab]: {
            ...tabState,
            history: newHistory,
            currentIndex: newHistory.length - 1,
          },
        }
        sessionStorage.setItem('tabNavigationStates', JSON.stringify(newState))
        return newState
      }

      return prev
    })
  }, [location.pathname, currentTab])

  const contextValue: TabNavigationContextValue = {
    scrollContainerRef,
    canGoBack: currentTabState.currentIndex > 0,
    goBack: () => {
      if (currentTabState.currentIndex > 0) {
        const previousPath = currentTabState.history[currentTabState.currentIndex - 1]
        setTabStates((prev) => ({
          ...prev,
          [currentTab]: {
            ...prev[currentTab],
            currentIndex: prev[currentTab].currentIndex - 1,
          },
        }))
        navigate(previousPath)
      }
    },
  }

  return (
    <TabNavigationContext.Provider value={contextValue}>{children}</TabNavigationContext.Provider>
  )
}
