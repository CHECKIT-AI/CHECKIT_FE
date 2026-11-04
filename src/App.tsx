import { Route, Routes } from 'react-router'
import Footer from './components/Footer'
import Header from './components/Header'
import AuthCompletePage from './pages/AuthCompletePage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import MyReportsPage from './pages/MyReportsPage'
import ReviewPage from './pages/ReviewPage'

function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/complete" element={<AuthCompletePage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/reports" element={<MyReportsPage />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}

export default App
