import { Suspense, lazy, useEffect, useState } from 'react'
import ExercisesPage from './pages/ExercisesPage'
import LandingPage from './pages/LandingPage'

// The exercise page carries the code editor (Monaco), so it loads only when an exercise opens.
const ExercisePage = lazy(() => import('./pages/ExercisePage'))

// Hash routes: #/  #/exercises  #/exercise/<id>
function useRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => {
      setRoute(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export default function App() {
  const route = useRoute()
  const exercise = /^\/exercise\/([\w-]+)$/.exec(route)
  if (exercise) return <Suspense fallback={null}><ExercisePage id={exercise[1]} /></Suspense>
  if (route === '/exercises') return <ExercisesPage />
  return <LandingPage />
}
