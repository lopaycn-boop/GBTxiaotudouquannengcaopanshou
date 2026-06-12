// frontend/src/App.jsx
import { Analytics } from '@vercel/analytics/react'
import MainPage from './pages/MainPage'

function App() {
  return (
    <>
      <MainPage />
      <Analytics />
    </>
  )
}

export default App