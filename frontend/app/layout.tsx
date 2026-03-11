import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { AuthProvider } from '@/components/auth-provider'
import { AssistantContextProvider } from '@/components/voice-assistant/assistant-context-provider'
import { VoiceAssistantWrapper } from '@/components/voice-assistant-wrapper'
import { Toaster } from '@/components/ui/toaster'

import './globals.css'

const _geist = Geist({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Arth Mitra - Your AI Financial Guide',
  description: 'Simplify Indian financial schemes and tax laws with AI-powered conversational guidance',
  icons: {
    icon: "/favicon2.ico",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>
          <AssistantContextProvider>
            {children}
            <VoiceAssistantWrapper />
            <Toaster />
          </AssistantContextProvider>
        </AuthProvider>
      </body>
    </html>
  )
}

