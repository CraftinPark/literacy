import { useEffect, useState } from 'react'
import ExercisePage from './pages/ExercisePage'
import ExercisesPage from './pages/ExercisesPage'
import FixQuizPage from './pages/FixQuizPage'
import LandingPage from './pages/LandingPage'

// Hash routes: #/  #/exercises  #/exercise/<id> (review)  #/fix/<id> (fix-and-quiz)
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
  const fix = /^\/fix\/([\w-]+)$/.exec(route)
  if (fix) return <FixQuizPage id={fix[1]} />
  if (route === '/exercises') return <ExercisesPage />
  return <LandingPage />
}
