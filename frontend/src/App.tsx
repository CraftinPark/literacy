import { useEffect, useState } from 'react'
import ExercisePage from './pages/ExercisePage'
import ExercisesPage from './pages/ExercisesPage'
import LandingPage from './pages/LandingPage'
import PlaygroundPage from './pages/PlaygroundPage'

// Hash routes: #/  #/exercises  #/exercise/<id>  #/playground
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
  if (exercise) return <ExercisePage id={exercise[1]} />
  if (route === '/exercises') return <ExercisesPage />
  if (route === '/playground') return <PlaygroundPage />
  return <LandingPage />
}
