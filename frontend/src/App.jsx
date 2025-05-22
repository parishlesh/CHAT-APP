import React from 'react'
import Navbar from './components/Navbar'
import { Navigate, Route, Router, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Signup from './pages/Signup'
import Login from './pages/Login'
import Settings from './pages/Settings'
import Profile from './pages/Profile'
import { useAuth } from './store/useAuth'
import { useEffect } from 'react'
import { Loader } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import { useThemeStore } from './store/useThemeStore'
import Button from './pages/Button'
import Sidebar from './components/Sidebar'


const App = () => {
  const {authUser, checkAuth, isCheckingAuth, onlineUsers} =useAuth()
   
  const {theme}=  useThemeStore() 

  console.log({onlineUsers});

  useEffect(() => {
    checkAuth();
    document.documentElement.setAttribute("data-theme", theme);
  }, [checkAuth, theme]);

  
  if (isCheckingAuth && !authUser)
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader className="size-10 animate-spin" />
      </div>
    );

  return (
    <div className="flex h-screen w-full" data-theme={theme}>

    <div className="w-[20%] bg-gray-100 border-r">
      <Navbar />
    </div>

    <div className="w-[60%] overflow-y-auto">
      <Routes>
        <Route path="/" element={authUser ? <Home /> : <Navigate to="/login" />} />
        <Route path="/signup" element={!authUser ? <Signup /> : <Navigate to="/" />} />
        <Route path="/login" element={!authUser ? <Login /> : <Navigate to="/" />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={authUser ? <Profile /> : <Navigate to="/login" />} />
        <Route path="/button" element={<Button />} />
      </Routes>
    </div>

  
    <div className="w-[20%] bg-gray-100 border-l">
      <Sidebar />
    </div>

    <Toaster />
  </div>
  )
}

export default App
