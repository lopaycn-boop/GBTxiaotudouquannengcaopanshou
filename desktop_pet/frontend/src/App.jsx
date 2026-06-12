// frontend/src/App.jsx
import MainPage from './pages/MainPage'
import { SpeedInsights } from '@vercel/speed-insights/react'

function App() {
  return (
    <>
      <MainPage />
      <SpeedInsights />
    </>
  )
}

export default App