import { Route, Routes } from 'react-router'
import Footer from './components/Footer'
import Header from './components/Header'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import MyReportsPage from './pages/MyReportsPage'

function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reports" element={<MyReportsPage />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}

export default App
