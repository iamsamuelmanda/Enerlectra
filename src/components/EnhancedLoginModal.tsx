import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X, Phone, Lock, User, QrCode, Eye, EyeOff, 
  Mail, Smartphone, Fingerprint, Globe, 
  Chrome, Download, UserCheck, Zap
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { usePWA } from '../hooks/usePWA'
import { useSocket } from '../contexts/SocketContext'
import { toast } from 'react-hot-toast'

interface EnhancedLoginModalProps {
  isOpen: boolean
  onClose: () => void
}

const EnhancedLoginModal: React.FC<EnhancedLoginModalProps> = ({ isOpen, onClose }) => {
  const [currentMode, setCurrentMode] = useState<'welcome' | 'phone' | 'email' | 'register' | 'otp'>('welcome')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const { startLogin, verifyLogin, register, enableGuestMode } = useAuth()
  const { canInstall, installPWA } = usePWA()
  const { isConnected } = useSocket()

  const handlePhoneLogin = async () => {
    if (!phoneNumber) {
      toast.error('Please enter a phone number')
      return
    }
    setIsLoading(true)
    try {
      await startLogin(phoneNumber)
      setCurrentMode('otp')
      toast.success('OTP sent to your phone')
    } catch (error) {
      toast.error('Failed to send OTP')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEmailLogin = async () => {
    if (!email) {
      toast.error('Please enter an email')
      return
    }
    setIsLoading(true)
    try {
      await startLogin(email)
      toast.success('Magic link sent to your email')
    } catch (error) {
      toast.error('Failed to send magic link')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGuestMode = () => {
    enableGuestMode()
    onClose()
    toast.success('Welcome to Enerlectra!')
  }

  const handleInstallPWA = async () => {
    try {
      await installPWA()
      toast.success('PWA installed successfully!')
    } catch (error) {
      toast.error('Failed to install PWA')
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Welcome to Enerlectra</h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {currentMode === 'welcome' && (
              <div className="space-y-4">
                <p className="text-gray-600 text-center">
                  Join The Energy Internet - Connect, Trade, and Power Africa's Future
                </p>
                
                <button
                  onClick={() => setCurrentMode('phone')}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <Phone className="w-5 h-5" />
                  <span>Continue with Phone</span>
                </button>

                <button
                  onClick={() => setCurrentMode('email')}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <Mail className="w-5 h-5" />
                  <span>Continue with Email</span>
                </button>

                <button
                  onClick={handleGuestMode}
                  className="w-full bg-gray-600 text-white py-3 px-4 rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <UserCheck className="w-5 h-5" />
                  <span>Continue as Guest</span>
                </button>

                {canInstall && (
                  <button
                    onClick={handleInstallPWA}
                    className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center space-x-2"
                  >
                    <Download className="w-5 h-5" />
                    <span>Install App</span>
                  </button>
                )}

                <div className="text-center text-sm text-gray-500">
                  WebSocket Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
                </div>
              </div>
            )}

            {currentMode === 'phone' && (
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-center">Phone Authentication</h3>
                <input
                  type="tel"
                  placeholder="Enter phone number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handlePhoneLogin}
                  disabled={isLoading}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Sending...' : 'Send OTP'}
                </button>
                <button
                  onClick={() => setCurrentMode('welcome')}
                  className="w-full bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Back
                </button>
              </div>
            )}

            {currentMode === 'email' && (
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-center">Email Authentication</h3>
                <input
                  type="email"
                  placeholder="Enter email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleEmailLogin}
                  disabled={isLoading}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Sending...' : 'Send Magic Link'}
                </button>
                <button
                  onClick={() => setCurrentMode('welcome')}
                  className="w-full bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Back
                </button>
              </div>
            )}

            {currentMode === 'otp' && (
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-center">Enter OTP</h3>
                <input
                  type="text"
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  maxLength={6}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl tracking-widest"
                />
                <button
                  onClick={() => setCurrentMode('welcome')}
                  className="w-full bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Back
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default EnhancedLoginModal 
