'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ArrowLeft, ArrowDown, Send, Bookmark, Clock, User, Wallet, Plus, MoreVertical, RefreshCw, MessageSquare, Zap, AlertCircle, Upload, FileText, Edit2, ChevronLeft, ChevronRight, BarChart2, Download, Pin, X, Pencil, Check, Copy, Shuffle, ThumbsUp, ThumbsDown } from 'lucide-react'
import { sendMessageStream, uploadFrameworkDocument, type ChatHistoryMessage, type FrameworkKey, createChatSession, getChatSessions, getChatMessages, deleteChatSession, getProfile, updateProfile as updateUserProfile, updateChatSessionTitle, getUserDocuments, deleteUserDocument, addSessionMessages, sendResponseFeedback } from '@/lib/api'
import { MarkdownMessage } from '@/components/markdown-message'
import { UserMenu } from '@/components/user-menu'
import { useAuth } from '@/components/auth-provider'
import { Logo } from '@/components/logo'
import { useRegisterAssistantData } from '@/components/voice-assistant/use-register-assistant-data'
import { useAssistantContext } from '@/components/voice-assistant/assistant-context-provider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { cleanSnippetText, SourceWithTooltip } from './chat-utils'

interface Message {
  id: string
  type: 'user' | 'ai'
  content: string
  timestamp: Date
  sources?: string[]
  confidence?: number
  confidenceLabel?: 'low' | 'medium' | 'high' | string
  whyThisAnswer?: string
  highlights?: { source: string; snippet: string }[]
  schemes?: {
    name: string
    score: number
    reason: string
    eligibility: string
    nextStep: string
    missingCriteria?: string[]
  }[]
  comparison?: {
    schemeA: {
      name: string
      score: number
      pros: string[]
      cons: string[]
      fit: string
    }
    schemeB: {
      name: string
      score: number
      pros: string[]
      cons: string[]
      fit: string
    }
    recommendedFit: string
  } | null
  documentInsights?: { field: string; value: string; source: string }[]
  actionPlan?: {
    title: string
    steps: string[]
    reminders: {
      title: string
      dueDate: string
      frequency: string
      category: string
    }[]
  } | null
  ragMetrics?: {
    totalChunks: number
    totalSources: number
    companyChunks: number
    companySources: number
    baselineChunks: number
    baselineSources: number
    otherChunks: number
    otherSources: number
    companyToBaselineChunkRatio?: number | null
    insufficientEvidenceClauses?: number
  }
  clauseHeatmap?: {
    framework: string
    coveragePct: number
    missingEvidenceCount: number
    strongEvidenceCount: number
    mediumEvidenceCount: number
    weakEvidenceCount: number
    coveredClauses: string[]
  }[]
  askBackQuestions?: string[]
  contradictions?: {
    clause: string
    issue: string
    companySnippet: string
    baselineSnippet: string
  }[]
  freshnessTracker?: {
    source: string
    sourceType: string
    effectiveDate: string
    stale: boolean
    warning: string
  }[]
  actionPlan306090?: {
    d30: { action: string; owner: string; impact: string }[]
    d60: { action: string; owner: string; impact: string }[]
    d90: { action: string; owner: string; impact: string }[]
  }
  clauseDrilldown?: {
    clause: string
    company: { source: string; snippet: string; evidenceStrength?: string }[]
    baseline: { source: string; snippet: string; evidenceStrength?: string }[]
    other: { source: string; snippet: string; evidenceStrength?: string }[]
  }[]
  followupPrompts?: string[]
  sectionConfidence?: Record<string, number>
  rubricScores?: Record<string, { title: string; coverageWeightedPct: number; coveredClauses: string[]; totalRubricWeight: number }>
  evidenceTrace?: {
    framework: string
    clause: string
    sourceType: string
    source: string
    evidenceStrength: string
    snippet: string
  }[]
  clauseValidation?: {
    isValid: boolean
    unsupportedClauses: string[]
    message: string
  }
  strictNoEvidenceMode?: boolean
  missingDetails?: string[]
  improvementSuggestions?: string[]
  cached?: boolean
  queryScope?: 'all' | 'selected'
  queryDocument?: string
}

interface RecentQuery {
  id: string
  title: string
  timestamp: string
  category: 'tax' | 'pension' | 'investment' | 'general'
}

type ChartType = 'bar' | 'line' | 'pie'
type ChartMode = 'response' | 'sources'
type ComparisonSort = 'default' | 'field-asc' | 'field-desc'

interface ChartDatum {
  label: string
  value: number
}

interface ChartInference {
  data: ChartDatum[]
  type: ChartType
  unit: string
}

interface ChartSnapshot {
  id: string
  title: string
  data: ChartDatum[]
  type: ChartType
  unit: string
}

interface UploadedDocument {
  id: string
  filename: string
  framework?: FrameworkKey
  storedFilename?: string
}

const suggestedQueries = [
  { text: 'Compare my ISO 37001 company document with the original standard and list key gaps', category: 'tax' as const },
  { text: 'Generate readiness score for ISO 37301 with evidence-backed findings', category: 'pension' as const },
  { text: 'Show clause-wise gaps for ISO 37000 from company doc vs baseline', category: 'investment' as const },
  { text: 'For ISO 37002, identify missing whistleblowing controls and next actions', category: 'tax' as const },
  { text: 'Create a 30-60-90 day remediation plan for all uploaded ISO frameworks', category: 'pension' as const },
  { text: 'Summarize strongest and weakest evidence from my uploaded compliance files', category: 'investment' as const }
]

const FRAMEWORK_UPLOAD_SLOTS: { key: FrameworkKey; label: string; helper: string }[] = [
  { key: 'iso37001', label: 'ISO 37001', helper: 'Upload company anti-bribery document' },
  { key: 'iso37301', label: 'ISO 37301', helper: 'Upload company compliance-management document' },
  { key: 'iso37000', label: 'ISO 37000', helper: 'Upload company governance document' },
  { key: 'iso37002', label: 'ISO 37002', helper: 'Upload company whistleblowing document' },
]

export default function ChatPage() {
  const router = useRouter()
  const { user } = useAuth()

  const buildWelcomeMessage = (): Message => ({
    id: '1',
    type: 'ai',
    content: 'Welcome to Arth-Mitra ISO Compliance Assistant.\n\nUpload your company documents into the 4 ISO slots, then ask for clause mapping, readiness scores, gap analysis, and remediation plans against baseline ISO documents.',
    timestamp: new Date(),
    sources: []
  })

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [uploadingFrameworks, setUploadingFrameworks] = useState<Partial<Record<FrameworkKey, boolean>>>({})
  const [uploadingFrameworkNames, setUploadingFrameworkNames] = useState<Partial<Record<FrameworkKey, string>>>({})
  const isUploading = useMemo(() => Object.values(uploadingFrameworks).some(Boolean), [uploadingFrameworks])
  const [lastUploadedFile, setLastUploadedFile] = useState<string>('')
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([])
  const [frameworkUploads, setFrameworkUploads] = useState<Partial<Record<FrameworkKey, string>>>({})
  const [showUploadPanel, setShowUploadPanel] = useState(false)
  const [documentOnlyMode, setDocumentOnlyMode] = useState(false)
  const [selectedDocumentFilter, setSelectedDocumentFilter] = useState<string>('')
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const lastScrollTopRef = useRef(0)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const frameworkInputRefs = useRef<Partial<Record<FrameworkKey, HTMLInputElement | null>>>({})
  const inputFieldRef = useRef<HTMLInputElement>(null)
  const [bookmarks, setBookmarks] = useState<string[]>([])
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([])
  const [copiedSourcesMessageId, setCopiedSourcesMessageId] = useState<string | null>(null)
  const [expandedSnippets, setExpandedSnippets] = useState<Record<string, boolean>>({})
  const [showLowEvidenceByMessage, setShowLowEvidenceByMessage] = useState<Record<string, boolean>>({})
  const [comparisonSortByMessage, setComparisonSortByMessage] = useState<Record<string, ComparisonSort>>({})
  const [chartData, setChartData] = useState<ChartDatum[]>([])
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [chartUnit, setChartUnit] = useState('')
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const [chartSnapshots, setChartSnapshots] = useState<ChartSnapshot[]>([])
  const [activeChartId, setActiveChartId] = useState<string | null>(null)
  const [chartMode, setChartMode] = useState<ChartMode>('response')

  // Initialize profile from localStorage
  const [profile, setProfile] = useState({
    age: 0,
    gender: '',
    income: '',
    employmentStatus: '',
    taxRegime: '',
    homeownerStatus: '',
    children: '',
    childrenAges: '',
    parentsAge: '',
    investmentCapacity: '',
    riskAppetite: '',
    financialGoals: [] as string[],
    existingInvestments: [] as string[]
  })

  // User and session state for database integration
  const [userId, setUserId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [chatSessions, setChatSessions] = useState<any[]>([])

  const [showNewChat, setShowNewChat] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [visibleSuggestions, setVisibleSuggestions] = useState(suggestedQueries)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<string, 'positive' | 'negative'>>({})
  const [feedbackLoading, setFeedbackLoading] = useState<Record<string, boolean>>({})

  // Sidebar collapse states
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true)
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true)

  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [editedProfile, setEditedProfile] = useState(profile)
  const initializationDone = useRef(false)

  // Session title editing
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingSessionTitle, setEditingSessionTitle] = useState('')

  // Deletion confirmation dialog
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'session' | 'document'; id: string; label: string } | null>(null)

  // Single initialization on mount - handles ALL navigation logic
  useEffect(() => {
    if (initializationDone.current) return
    initializationDone.current = true

    const initializeChat = async () => {
      // Get userId from localStorage
      let storedUserId = localStorage.getItem('userId')

      // Fallback: recover from cookie-based auth session
      if (!storedUserId) {
        try {
          const res = await fetch('/api/auth/me')
          const data = await res.json()
          if (data?.user?.id) {
            storedUserId = data.user.id
            localStorage.setItem('userId', data.user.id)
            localStorage.setItem('userEmail', data.user.email || '')
            localStorage.setItem('userName', data.user.name || '')
          }
        } catch (error) {
          console.error('Failed to restore user from session:', error)
        }
      }

      if (!storedUserId) {
        // No user ID - redirect to login
        router.push('/login')
        return
      }
      setUserId(storedUserId)

      try {
        // Fetch profile from database
        const userProfile = await getProfile(storedUserId)

        // Check if profile is complete (all required fields filled)
        const isComplete = userProfile.income && userProfile.taxRegime && userProfile.age

        if (!isComplete) {
          // Profile incomplete - redirect to profile-setup
          router.push('/profile-setup')
          return
        }

        // Map database profile to local profile format
        const profileData = {
          age: userProfile.age || 0,
          gender: userProfile.gender || '',
          income: userProfile.income || '',
          employmentStatus: userProfile.employmentStatus || '',
          taxRegime: userProfile.taxRegime || '',
          homeownerStatus: userProfile.homeownerStatus || '',
          children: userProfile.children || '',
          childrenAges: userProfile.childrenAges || '',
          parentsAge: userProfile.parentsAge || '',
          investmentCapacity: userProfile.investmentCapacity || '',
          riskAppetite: userProfile.riskAppetite || '',
          financialGoals: userProfile.financialGoals || [],
          existingInvestments: userProfile.existingInvestments || []
        }

        // Load the complete profile
        setProfile(profileData)
        setEditedProfile(profileData)

        // Also save to localStorage for backward compatibility
        localStorage.setItem('userProfile', JSON.stringify({ ...profileData, isProfileComplete: true }))
      } catch (error) {
        console.error('Failed to load profile:', error)
        // Fallback to localStorage if API fails
        const savedProfile = localStorage.getItem('userProfile')
        if (savedProfile) {
          const parsed = JSON.parse(savedProfile)
          if (parsed.isProfileComplete) {
            setProfile(parsed)
            setEditedProfile(parsed)
          } else {
            router.push('/profile-setup')
            return
          }
        } else {
          router.push('/profile-setup')
          return
        }
      }

      // Create or load chat session
      try {
        // Check if there's an active session in localStorage (user-specific)
        let storedSessionId = localStorage.getItem(`currentSessionId_${storedUserId}`)
        // Clean up corrupted session IDs from previous bugs
        if (storedSessionId === 'undefined' || storedSessionId === 'null') {
          localStorage.removeItem(`currentSessionId_${storedUserId}`)
          storedSessionId = null
        }
        if (storedSessionId) {
          setSessionId(storedSessionId)
          // Load messages for this session from API
          try {
            const apiMessages = await getChatMessages(storedSessionId)
            if (apiMessages && apiMessages.length > 0) {
              const convertedMessages: Message[] = apiMessages.map(msg => ({
                id: msg.id,
                type: msg.role === 'user' ? 'user' : 'ai',
                content: msg.content,
                timestamp: new Date(msg.createdAt),
                sources: msg.sources || []
              }))
              setMessages(convertedMessages)
            } else {
              // Fallback to user-specific localStorage
              const savedHistory = localStorage.getItem(`chatHistory_${storedUserId}`)
              if (savedHistory) {
                const parsed = JSON.parse(savedHistory) as Array<Omit<Message, 'timestamp'> & { timestamp: string }>
                setMessages(parsed.map(item => ({
                  ...item,
                  timestamp: new Date(item.timestamp)
                })))
              } else {
                setMessages([buildWelcomeMessage()])
              }
            }
          } catch {
            setMessages([buildWelcomeMessage()])
          }
        } else {
          // Create a new session
          const newSession = await createChatSession(storedUserId, 'New Chat')
          setSessionId(newSession.id)
          localStorage.setItem(`currentSessionId_${storedUserId}`, newSession.id)
          setMessages([buildWelcomeMessage()])
        }

        // Load all chat sessions for the user
        loadChatSessions(storedUserId)
      } catch (error) {
        console.error('Failed to initialize session:', error)
        setMessages([buildWelcomeMessage()])
      }
    }

    initializeChat()
  }, [])

  // Persist chat history (user-specific)
  useEffect(() => {
    if (messages.length === 0 || !userId) return

    const serializable = messages.map(msg => ({
      ...msg,
      timestamp: msg.timestamp.toISOString()
    }))
    localStorage.setItem(`chatHistory_${userId}`, JSON.stringify(serializable))
  }, [messages, userId])

  // ── Voice assistant: inject finance queries into a new chat ──
  const handleVoiceFinanceQuery = useCallback(async (e: Event) => {
    const { userText, reply } = (e as CustomEvent).detail as { userText: string; reply: string }
    if (!userId) return

    try {
      // Create a new session for this finance query
      const title = userText.trim().split(/\s+/).slice(0, 7).join(' ')
      const newSession = await createChatSession(userId, title)
      if (!newSession?.id) return

      setSessionId(newSession.id)
      localStorage.setItem(`currentSessionId_${userId}`, newSession.id)

      // Inject both messages into the chat UI
      const userMsg: Message = {
        id: Date.now().toString(),
        type: 'user',
        content: userText,
        timestamp: new Date(),
      }
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: reply,
        timestamp: new Date(),
      }
      setMessages([buildWelcomeMessage(), userMsg, aiMsg])
      setShowSuggestions(false)

      // Persist to backend
      await addSessionMessages(newSession.id, userText, reply)

      // Refresh sidebar
      loadChatSessions(userId)
    } catch (err) {
      console.error('Failed to inject voice finance query into chat:', err)
    }
  }, [userId, sessionId])

  // Listen for voice-finance-query events + check sessionStorage on mount
  useEffect(() => {
    window.addEventListener('voice-finance-query', handleVoiceFinanceQuery)

    // Check if navigated here from the voice assistant on another page
    const pending = sessionStorage.getItem('pendingVoiceFinanceQuery')
    if (pending) {
      sessionStorage.removeItem('pendingVoiceFinanceQuery')
      try {
        const detail = JSON.parse(pending)
        // Small delay to let initialization complete
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('voice-finance-query', { detail }))
        }, 800)
      } catch { /* ignore parse errors */ }
    }

    return () => {
      window.removeEventListener('voice-finance-query', handleVoiceFinanceQuery)
    }
  }, [handleVoiceFinanceQuery])

  const parseNumericValue = (raw: string): number | null => {
    const cleaned = raw
      .replace(/[,₹$]/g, '')
      .replace(/%/g, '')
      .trim()

    const value = Number.parseFloat(cleaned)
    return Number.isFinite(value) ? value : null
  }

  const inferChartData = (content: string): ChartInference => {
    const rows: ChartDatum[] = []
    const used = new Set<string>()

    const addRow = (label: string, value: number | null) => {
      const key = label.trim()
      if (!key || value === null || !Number.isFinite(value)) return
      if (used.has(key)) return
      used.add(key)
      rows.push({ label: key, value })
    }

    const lines = content.split('\n')

    for (const line of lines) {
      if (line.startsWith('|') && line.endsWith('|')) {
        const cells = line.split('|').map(cell => cell.trim()).filter(Boolean)
        if (cells.length >= 2 && !cells[1].includes('---')) {
          addRow(cells[0], parseNumericValue(cells[1]))
        }
      }
    }

    const colonRegex = /([A-Za-z][^:\n]{1,40})\s*:\s*([₹$]?\d[\d,]*\.?\d*%?)/g
    let colonMatch: RegExpExecArray | null
    while ((colonMatch = colonRegex.exec(content)) !== null) {
      addRow(colonMatch[1], parseNumericValue(colonMatch[2]))
    }

    const bulletRegex = /[-*]\s*\*\*?([^*]+)\*\*?:?\s*([₹$]?\d[\d,]*\.?\d*%?)/g
    let bulletMatch: RegExpExecArray | null
    while ((bulletMatch = bulletRegex.exec(content)) !== null) {
      addRow(bulletMatch[1], parseNumericValue(bulletMatch[2]))
    }

    const dateHint = rows.some(item => /\b(\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(item.label))
    const sum = rows.reduce((acc, item) => acc + item.value, 0)
    const isPercentLike = rows.length > 1 && rows.length <= 6 && sum >= 95 && sum <= 105

    if (!dateHint) {
      rows.sort((a, b) => b.value - a.value)
    }

    let unit = ''
    if (/₹|\binr\b/i.test(content)) unit = '₹'
    if (/\b(lpa|lakh|lakhs|lac|crore|cr)\b/i.test(content)) unit = '₹'
    if (/%/.test(content)) unit = '%'

    if (dateHint) {
      return { data: rows, type: 'line', unit }
    }

    if (isPercentLike) {
      return { data: rows, type: 'pie', unit: unit || '%' }
    }

    return { data: rows, type: 'bar', unit }
  }

  const getChartTitle = (content: string, timestamp: Date) => {
    const firstLine = content.split('\n').find(line => line.trim()) || ''
    const cleaned = firstLine.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim()
    if (cleaned) return cleaned.slice(0, 48)
    return `Response ${timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`
  }

  const formatChartValue = (value: number, unit: string) => {
    const formatted = value.toLocaleString('en-IN')
    if (!unit) return formatted
    return unit === '%' ? `${formatted}%` : `${unit}${formatted}`
  }

  const getLegendLabel = () => {
    if (chartMode === 'sources') return 'Source frequency'
    if (chartUnit === '%') return 'Savings (%)'
    if (chartUnit === '₹') return 'Savings (₹)'
    return 'Savings'
  }

  const getActiveSnapshot = () => chartSnapshots.find(snapshot => snapshot.id === activeChartId) || null

  const handleExportChart = () => {
    const container = chartContainerRef.current
    if (!container) return

    const svg = container.querySelector('svg')
    if (!svg) return

    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(svg)
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()

    img.onload = () => {
      const scale = window.devicePixelRatio || 1
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.scale(scale, scale)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, img.width, img.height)
      ctx.drawImage(img, 0, 0)

      const pngUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.href = pngUrl
      link.download = `arth-mitra-chart-${Date.now()}.png`
      link.click()
      URL.revokeObjectURL(url)
    }

    img.src = url
  }

  const shortenLabel = (label: string) => {
    const trimmed = label.trim()
    return trimmed.length > 14 ? `${trimmed.slice(0, 14)}...` : trimmed
  }

  const buildSourceChartData = (items: Message[]) => {
    const counts = new Map<string, number>()
    items
      .filter(msg => msg.type === 'ai' && msg.sources && msg.sources.length > 0)
      .forEach(msg => {
        msg.sources!.forEach(source => {
          counts.set(source, (counts.get(source) || 0) + 1)
        })
      })

    const data = Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)

    setChartData(data)
    setChartUnit('')
    setChartType('bar')
  }

  useEffect(() => {
    if (chartMode === 'sources') return
    if (isLoading) return
    const lastAiMessage = [...messages].reverse().find(msg => msg.type === 'ai' && msg.content.trim())
    if (!lastAiMessage) return

    const inferred = inferChartData(lastAiMessage.content)
    if (inferred.data.length === 0) return

    const snapshot: ChartSnapshot = {
      id: lastAiMessage.id,
      title: getChartTitle(lastAiMessage.content, lastAiMessage.timestamp),
      data: inferred.data,
      type: inferred.type,
      unit: inferred.unit,
    }

    setChartSnapshots(prev => {
      const exists = prev.some(item => item.id === snapshot.id)
      if (exists) return prev
      return [snapshot, ...prev].slice(0, 6)
    })
    setActiveChartId(snapshot.id)
    setChartData(inferred.data)
    setChartType(inferred.type)
    setChartUnit(inferred.unit)
  }, [messages, isLoading, chartMode])

  useEffect(() => {
    if (chartMode !== 'sources') return
    buildSourceChartData(messages)
  }, [messages, chartMode])

  useEffect(() => {
    if (chartMode === 'sources') return
    if (!activeChartId) return
    const snapshot = chartSnapshots.find(item => item.id === activeChartId)
    if (!snapshot) return
    setChartData(snapshot.data)
    setChartType(snapshot.type)
    setChartUnit(snapshot.unit)
  }, [activeChartId, chartSnapshots, chartMode])

  const recentQueries: RecentQuery[] = [
    { id: '1', title: 'Tax saving with ₹10 lakh income', timestamp: '13/02/2026', category: 'tax' },
    { id: '2', title: 'Best pension scheme comparison', timestamp: '12/02/2026', category: 'pension' },
    { id: '3', title: 'Investment portfolio allocation', timestamp: '11/02/2026', category: 'investment' }
  ]

  const isNearBottom = () => {
    const container = messagesContainerRef.current
    if (!container) return true
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    return distanceFromBottom < 120
  }

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current
    if (!container) return

    const currentTop = container.scrollTop
    if (currentTop < lastScrollTopRef.current - 2) {
      shouldAutoScrollRef.current = false
      setShowJumpToLatest(true)
    } else {
      const nearBottom = isNearBottom()
      shouldAutoScrollRef.current = nearBottom
      setShowJumpToLatest(!nearBottom)
    }
    lastScrollTopRef.current = currentTop
  }

  const handleMessagesWheelCapture = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) {
      shouldAutoScrollRef.current = false
      setShowJumpToLatest(true)
    }
  }

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return
    scrollToBottom(isLoading ? 'auto' : 'smooth')
    setShowJumpToLatest(false)
  }, [messages, isLoading])

  useEffect(() => {
    setPinnedMessageIds(prev => prev.filter(id => messages.some(msg => msg.id === id && msg.type === 'ai')))
  }, [messages])

  const handleJumpToLatest = () => {
    shouldAutoScrollRef.current = true
    setShowJumpToLatest(false)
    scrollToBottom('smooth')
  }

  const handleSendMessage = async () => {
    if (!input.trim()) return

    // Check if this is the first user message (for session title auto-update)
    const isFirstUserMessage = messages.filter(m => m.type === 'user').length === 0

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input,
      timestamp: new Date()
    }

    const history: ChatHistoryMessage[] = messages
      .filter(msg => {
        if (msg.type === 'user') return true
        if (msg.content.startsWith('📄 Uploading')) return false
        if (msg.content.startsWith('✅ ')) return false
        if (msg.content.startsWith('❌ Failed to upload')) return false
        return true
      })
      .map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      }))

    const aiMessageId = (Date.now() + 1).toString()
    const activeDocFilter = documentOnlyMode && selectedDocumentFilter ? selectedDocumentFilter : undefined
    const aiMessage: Message = {
      id: aiMessageId,
      type: 'ai',
      content: '',
      timestamp: new Date(),
      sources: [],
      highlights: [],
      schemes: [],
      queryScope: activeDocFilter ? 'selected' : 'all',
      queryDocument: activeDocFilter
    }

    shouldAutoScrollRef.current = true
    setMessages(prev => [...prev, userMessage, aiMessage])
    const userInput = input
    setInput('')
    setIsLoading(true)
    setStreamingMessageId(aiMessageId)
    setShowSuggestions(false)

    // Clear last uploaded file after first question
    if (lastUploadedFile) {
      setLastUploadedFile('')
    }

    try {
      await sendMessageStream(
        userInput,
        profile,
        history,
        (token) => {
          setMessages(prev => prev.map(msg =>
            msg.id === aiMessageId
              ? { ...msg, content: msg.content + token }
              : msg
          ))
        },
        (sources) => {
          setMessages(prev => prev.map(msg =>
            msg.id === aiMessageId
              ? { ...msg, sources }
              : msg
          ))
        },
        (meta) => {
          setMessages(prev => prev.map(msg =>
            msg.id === aiMessageId
              ? {
                ...msg,
                confidence: meta.confidence,
                confidenceLabel: meta.confidenceLabel,
                whyThisAnswer: meta.whyThisAnswer,
                highlights: meta.highlights || [],
                comparison: meta.comparison,
                documentInsights: meta.documentInsights || [],
                ragMetrics: meta.ragMetrics,
                clauseHeatmap: meta.clauseHeatmap || [],
                askBackQuestions: meta.askBackQuestions || [],
                contradictions: meta.contradictions || [],
                freshnessTracker: meta.freshnessTracker || [],
                actionPlan306090: meta.actionPlan306090,
                clauseDrilldown: meta.clauseDrilldown || [],
                followupPrompts: meta.followupPrompts || [],
                sectionConfidence: meta.sectionConfidence || {},
                rubricScores: meta.rubricScores || {},
                evidenceTrace: meta.evidenceTrace || [],
                clauseValidation: meta.clauseValidation,
                strictNoEvidenceMode: meta.strictNoEvidenceMode,
                missingDetails: meta.missingDetails || [],
                improvementSuggestions: meta.improvementSuggestions || [],
                cached: meta.cached,
              }
              : msg
          ))
        },
        userId || undefined,
        sessionId || undefined,
        activeDocFilter
      )
    } catch (error) {
      console.error('Chat error:', error)
      setMessages(prev => prev.map(msg =>
        msg.id === aiMessageId
          ? { ...msg, content: 'Sorry, I encountered an error connecting to the server. Please make sure the backend is running and try again.' }
          : msg
      ))
    } finally {
      setIsLoading(false)
      setStreamingMessageId(null)
      // Reload sessions if this was the first message (title auto-updated by backend)
      if (isFirstUserMessage && userId) {
        loadChatSessions(userId)
      }
    }
  }

  const toggleBookmark = (messageId: string) => {
    setBookmarks(prev =>
      prev.includes(messageId)
        ? prev.filter(id => id !== messageId)
        : [...prev, messageId]
    )
  }

  const handleFeedback = async (messageId: string, sentiment: 'positive' | 'negative') => {
    if (feedbackLoading[messageId]) return
    const targetMessage = messages.find(msg => msg.id === messageId)
    if (!targetMessage || targetMessage.type !== 'ai') return

    setFeedbackLoading(prev => ({ ...prev, [messageId]: true }))
    try {
      await sendResponseFeedback({
        userId: userId || undefined,
        sessionId: sessionId || undefined,
        messageId,
        score: sentiment === 'positive' ? 1 : -1,
        sentiment,
        query: messages.filter(m => m.type === 'user').slice(-1)[0]?.content,
      })
      setFeedbackByMessage(prev => ({ ...prev, [messageId]: sentiment }))
    } catch (error) {
      console.error('Failed to submit feedback', error)
    } finally {
      setFeedbackLoading(prev => ({ ...prev, [messageId]: false }))
    }
  }

  const handleSuggestedQuery = (query: string) => {
    setInput(query)
    setTimeout(() => {
      const event = new KeyboardEvent('keydown', { key: 'Enter' })
      document.querySelector('input')?.dispatchEvent(event)
    }, 0)
  }

  const handleFollowupPrompt = (prompt: string) => {
    setInput(prompt)
    setTimeout(() => {
      if (inputFieldRef.current) {
        inputFieldRef.current.focus()
      }
    }, 0)
  }

  const shuffleSuggestions = () => {
    setVisibleSuggestions(prev => [...prev].sort(() => Math.random() - 0.5))
  }

  const handleCopyMessage = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 1600)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = content
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 1600)
    }
  }

  const handleSourceChipClick = (source: string) => {
    setSelectedDocumentFilter(source)
    setDocumentOnlyMode(true)
    setUploadedDocuments(prev => (prev.some(d => d.filename === source) ? prev : [{ id: '', filename: source }, ...prev]))
  }

  const handleCopySources = async (message: Message) => {
    if (!message.sources || message.sources.length === 0) return

    const uniqueSources = Array.from(new Set(message.sources))
    const text = [
      `Sources (${uniqueSources.length})`,
      ...uniqueSources.map((source, index) => `${index + 1}. ${source}`),
    ].join('\n')

    try {
      await navigator.clipboard.writeText(text)
      setCopiedSourcesMessageId(message.id)
      setTimeout(() => setCopiedSourcesMessageId(null), 1600)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopiedSourcesMessageId(message.id)
      setTimeout(() => setCopiedSourcesMessageId(null), 1600)
    }
  }

  const toggleSnippet = (messageId: string, highlightIndex: number) => {
    const key = `${messageId}-${highlightIndex}`
    setExpandedSnippets(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const isLowEvidence = (strength?: string) => (strength || '').toLowerCase() === 'low'

  const toggleLowEvidence = (messageId: string) => {
    setShowLowEvidenceByMessage(prev => ({
      ...prev,
      [messageId]: !prev[messageId],
    }))
  }

  const togglePinMessage = (messageId: string) => {
    setPinnedMessageIds(prev =>
      prev.includes(messageId)
        ? prev.filter(id => id !== messageId)
        : [messageId, ...prev]
    )
  }

  const getComparisonRows = (message: Message) => {
    if (!message.comparison) return [] as Array<{ field: string; a: string; b: string; wide?: boolean }>

    const rows = [
      {
        field: 'Score',
        a: `${message.comparison.schemeA.score}/100`,
        b: `${message.comparison.schemeB.score}/100`,
      },
      {
        field: 'Pros',
        a: message.comparison.schemeA.pros.join('; ') || '—',
        b: message.comparison.schemeB.pros.join('; ') || '—',
      },
      {
        field: 'Cons',
        a: message.comparison.schemeA.cons.join('; ') || '—',
        b: message.comparison.schemeB.cons.join('; ') || '—',
      },
      {
        field: 'Recommended fit',
        a: message.comparison.recommendedFit,
        b: '',
        wide: true,
      },
    ]

    const sortMode = comparisonSortByMessage[message.id] || 'default'
    if (sortMode === 'default') return rows

    const sortableRows = [...rows].sort((left, right) =>
      sortMode === 'field-asc'
        ? left.field.localeCompare(right.field)
        : right.field.localeCompare(left.field)
    )

    return sortableRows
  }

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const inlineMarkdownToHtml = (value: string) =>
    escapeHtml(value)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')

  const markdownTableToHtml = (tableLines: string[]) => {
    const rows = tableLines
      .map(line => line.trim().replace(/^\|/, '').replace(/\|$/, ''))
      .map(line => line.split('|').map(cell => cell.trim()))

    if (rows.length === 0) return ''

    const header = rows[0]
    const bodyRows = rows.slice(1).filter(cells => !cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s/g, ''))))

    return `
      <table class="md-table">
        <thead>
          <tr>${header.map(cell => `<th>${inlineMarkdownToHtml(cell)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${bodyRows
        .map(cells => `<tr>${cells.map(cell => `<td>${inlineMarkdownToHtml(cell)}</td>`).join('')}</tr>`)
        .join('')}
        </tbody>
      </table>
    `
  }

  const markdownToPrintableHtml = (content: string) => {
    const normalized = content.replace(/<br\s*\/?>/gi, '\n')
    const lines = normalized.split('\n')
    const chunks: string[] = []
    let index = 0

    while (index < lines.length) {
      const rawLine = lines[index]
      const line = rawLine.trim()

      if (!line) {
        index += 1
        continue
      }

      if (line.startsWith('|')) {
        const tableLines: string[] = []
        while (index < lines.length && lines[index].trim().startsWith('|')) {
          tableLines.push(lines[index])
          index += 1
        }
        chunks.push(markdownTableToHtml(tableLines))
        continue
      }

      const headingMatch = line.match(/^(#{1,4})\s+(.+)/)
      if (headingMatch) {
        const level = Math.min(4, headingMatch[1].length)
        chunks.push(`<h${level} class="md-h${level}">${inlineMarkdownToHtml(headingMatch[2])}</h${level}>`)
        index += 1
        continue
      }

      if (/^[-*]\s+/.test(line)) {
        const listItems: string[] = []
        while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
          listItems.push(lines[index].trim().replace(/^[-*]\s+/, ''))
          index += 1
        }
        chunks.push(`<ul class="md-ul">${listItems.map(item => `<li>${inlineMarkdownToHtml(item)}</li>`).join('')}</ul>`)
        continue
      }

      chunks.push(`<p>${inlineMarkdownToHtml(line)}</p>`)
      index += 1
    }

    return chunks.join('')
  }

  const buildPrintableDocument = () => {
    const printable = messages
      .map(message => {
        const comparisonBlock = message.type === 'ai' && message.comparison
          ? `
            <div class="meta-block">
              <p class="meta-title"><strong>Scheme Comparison</strong></p>
              <table class="md-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>${escapeHtml(message.comparison.schemeA.name)}</th>
                    <th>${escapeHtml(message.comparison.schemeB.name)}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Score</td>
                    <td>${escapeHtml(`${message.comparison.schemeA.score}/100`)}</td>
                    <td>${escapeHtml(`${message.comparison.schemeB.score}/100`)}</td>
                  </tr>
                  <tr>
                    <td>Pros</td>
                    <td>${escapeHtml(message.comparison.schemeA.pros.join('; ') || '—')}</td>
                    <td>${escapeHtml(message.comparison.schemeB.pros.join('; ') || '—')}</td>
                  </tr>
                  <tr>
                    <td>Cons</td>
                    <td>${escapeHtml(message.comparison.schemeA.cons.join('; ') || '—')}</td>
                    <td>${escapeHtml(message.comparison.schemeB.cons.join('; ') || '—')}</td>
                  </tr>
                  <tr>
                    <td>Recommended Fit</td>
                    <td colspan="2">${escapeHtml(message.comparison.recommendedFit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          `
          : ''

        const insightsBlock = message.type === 'ai' && message.documentInsights && message.documentInsights.length > 0
          ? `
            <div class="meta-block">
              <p class="meta-title"><strong>Document Insights</strong></p>
              <ul class="md-ul">${message.documentInsights
            .map(insight => `<li>${escapeHtml(`${insight.field}: ${insight.value} (Source: ${insight.source})`)}</li>`)
            .join('')}</ul>
            </div>
          `
          : ''

        const heatmapBlock = message.type === 'ai' && message.clauseHeatmap && message.clauseHeatmap.length > 0
          ? `
            <div class="meta-block">
              <p class="meta-title"><strong>Clause Coverage Heatmap</strong></p>
              <ul class="md-ul">${message.clauseHeatmap
            .map(row => `<li>${escapeHtml(`${row.framework}: coverage ${row.coveragePct}%, missing ${row.missingEvidenceCount}`)}</li>`)
            .join('')}</ul>
            </div>
          `
          : ''

        const contradictionBlock = message.type === 'ai' && message.contradictions && message.contradictions.length > 0
          ? `
            <div class="meta-block">
              <p class="meta-title"><strong>Contradictions</strong></p>
              <ul class="md-ul">${message.contradictions
            .map(item => `<li>${escapeHtml(`Clause ${item.clause}: ${item.issue}`)}</li>`)
            .join('')}</ul>
            </div>
          `
          : ''

        const action306090Block = message.type === 'ai' && message.actionPlan306090
          ? `
            <div class="meta-block">
              <p class="meta-title"><strong>30/60/90 Action Plan</strong></p>
              <p><strong>30d:</strong> ${escapeHtml((message.actionPlan306090.d30 || []).map(a => a.action).slice(0, 3).join('; ') || 'N/A')}</p>
              <p><strong>60d:</strong> ${escapeHtml((message.actionPlan306090.d60 || []).map(a => a.action).slice(0, 3).join('; ') || 'N/A')}</p>
              <p><strong>90d:</strong> ${escapeHtml((message.actionPlan306090.d90 || []).map(a => a.action).slice(0, 3).join('; ') || 'N/A')}</p>
            </div>
          `
          : ''

        const trust = message.type === 'ai'
          ? `
            <div class="meta">
              ${typeof message.confidence === 'number' ? `<p><strong>Confidence:</strong> ${Math.round(message.confidence * 100)}% (${escapeHtml(String(message.confidenceLabel || 'n/a'))})</p>` : ''}
              ${message.sources?.length ? `<p><strong>Sources:</strong> ${message.sources.map(escapeHtml).join(', ')}</p>` : ''}
              ${message.ragMetrics ? `<p><strong>RAG metrics:</strong> company chunks ${message.ragMetrics.companyChunks}, baseline chunks ${message.ragMetrics.baselineChunks}, total chunks ${message.ragMetrics.totalChunks}</p>` : ''}
              ${message.whyThisAnswer ? `<p><strong>Why this answer:</strong> ${escapeHtml(message.whyThisAnswer)}</p>` : ''}
              ${comparisonBlock}
              ${insightsBlock}
              ${heatmapBlock}
              ${contradictionBlock}
              ${action306090Block}
            </div>
          `
          : ''

        return `
          <article class="msg">
            <h3>${message.type === 'user' ? 'User' : 'Arth Mitra'} • ${escapeHtml(message.timestamp.toLocaleString())}</h3>
            <div class="msg-content">${markdownToPrintableHtml(message.content)}</div>
            ${trust}
          </article>
        `
      })
      .join('')

    return `
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Arth-Mitra Chat Export</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
            h1 { font-size: 20px; margin-bottom: 16px; }
            .msg { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; margin-bottom: 12px; }
            .msg h3 { margin: 0 0 8px 0; font-size: 14px; }
            .msg p { margin: 0; font-size: 13px; line-height: 1.5; }
            .msg-content { font-size: 13px; line-height: 1.55; }
            .msg-content p { margin: 0 0 8px 0; }
            .msg-content .md-h1, .msg-content .md-h2, .msg-content .md-h3, .msg-content .md-h4 { margin: 8px 0 6px 0; font-weight: 700; }
            .msg-content .md-h1 { font-size: 18px; }
            .msg-content .md-h2 { font-size: 16px; }
            .msg-content .md-h3 { font-size: 15px; }
            .msg-content .md-h4 { font-size: 14px; }
            .msg-content .md-ul { margin: 0 0 8px 18px; padding: 0; }
            .msg-content .md-ul li { margin: 0 0 4px 0; }
            .msg-content .md-table { width: 100%; border-collapse: collapse; margin: 8px 0; table-layout: fixed; }
            .msg-content .md-table th, .msg-content .md-table td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: top; word-break: break-word; }
            .msg-content .md-table th { background: #f8fafc; font-weight: 700; }
            .meta { margin-top: 8px; font-size: 12px; color: #374151; }
            .meta p { margin: 3px 0; }
            .meta-block { margin-top: 10px; }
            .meta-title { margin: 6px 0; color: #111827; }
          </style>
        </head>
        <body>
          <h1>Arth-Mitra Chat Export</h1>
          ${printable}
        </body>
      </html>
    `
  }

  const exportChatAsHtml = () => {
    const htmlDocument = buildPrintableDocument()
    const blob = new Blob([htmlDocument], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `arth-mitra-chat-${Date.now()}.html`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportChatAsPdf = () => {
    const htmlDocument = buildPrintableDocument()
    const popup = window.open('', '_blank')
    if (!popup) return

    popup.document.write(htmlDocument)
    popup.document.close()
    popup.focus()
    popup.print()
  }

  const handleCreateChartFromMessage = (message: Message) => {
    const inferred = inferChartData(message.content)
    if (inferred.data.length === 0) return

    const snapshot: ChartSnapshot = {
      id: message.id,
      title: getChartTitle(message.content, message.timestamp),
      data: inferred.data,
      type: inferred.type,
      unit: inferred.unit,
    }

    setChartMode('response')
    setChartSnapshots(prev => {
      const withoutCurrent = prev.filter(item => item.id !== snapshot.id)
      return [snapshot, ...withoutCurrent].slice(0, 6)
    })
    setActiveChartId(snapshot.id)
    setChartData(snapshot.data)
    setChartType(snapshot.type)
    setChartUnit(snapshot.unit)
    if (!isRightSidebarOpen) setIsRightSidebarOpen(true)
  }

  const handleRegenerateFromMessage = (message: Message) => {
    setInput(`Please regenerate this response with clearer steps and concise action points:\n\n${message.content.slice(0, 600)}`)
    inputFieldRef.current?.focus()
  }

  const handleCompareQuickAction = () => {
    const lastAiWithSchemes = [...messages]
      .reverse()
      .find(msg => msg.type === 'ai' && msg.schemes && msg.schemes.length >= 2)

    const fallbackA = 'Public Provident Fund (PPF)'
    const fallbackB = 'National Pension System (NPS)'

    const schemeA = lastAiWithSchemes?.schemes?.[0]?.name || fallbackA
    const schemeB = lastAiWithSchemes?.schemes?.[1]?.name || fallbackB

    const docScopeText = documentOnlyMode && selectedDocumentFilter
      ? ` and use only ${selectedDocumentFilter}`
      : ''

    setInput(`Compare ${schemeA} vs ${schemeB} for my profile in a side-by-side table with pros/cons, missing criteria, and recommended fit${docScopeText}.`)
    inputFieldRef.current?.focus()
  }

  const handleClearChat = () => {
    if (userId) {
      localStorage.removeItem(`chatHistory_${userId}`)
    }
    setMessages([buildWelcomeMessage()])
    setShowSuggestions(true)
    setLastUploadedFile('')
    setStreamingMessageId(null)
    setIsLoading(false)
    setVisibleSuggestions([...suggestedQueries])
    setPinnedMessageIds([])
    setExpandedSnippets({})
    setComparisonSortByMessage({})
  }

  const handleNewChat = async () => {
    try {
      if (!userId) {
        console.error('User ID not found')
        return
      }

      // Create a new session
      const newSession = await createChatSession(userId, 'New Chat')
      setSessionId(newSession.id)
      localStorage.setItem(`currentSessionId_${userId}`, newSession.id)

      // Clear chat history and show welcome message
      setMessages([buildWelcomeMessage()])
      setShowSuggestions(true)
      setVisibleSuggestions([...suggestedQueries])
      setLastUploadedFile('')
      setStreamingMessageId(null)
      setIsLoading(false)
      setPinnedMessageIds([])
      setExpandedSnippets({})
      setComparisonSortByMessage({})

      // Reload chat sessions to show the new one
      loadChatSessions(userId)
    } catch (error) {
      console.error('Failed to create new chat:', error)
      alert('Failed to create new chat. Please try again.')
    }
  }

  const loadChatSessions = async (userId: string) => {
    try {
      const sessions = await getChatSessions(userId)
      setChatSessions(sessions)
    } catch (error) {
      console.error('Failed to load chat sessions:', error)
    }
  }

  const handleLoadSession = async (sessionId: string, sessionTitle: string) => {
    try {
      // Set the active session
      setSessionId(sessionId)
      if (userId) {
        localStorage.setItem(`currentSessionId_${userId}`, sessionId)
      }

      // Load messages for this session
      const apiMessages = await getChatMessages(sessionId)

      if (apiMessages && apiMessages.length > 0) {
        // Convert API messages to local format
        const convertedMessages: Message[] = apiMessages.map(msg => ({
          id: msg.id,
          type: msg.role === 'user' ? 'user' : 'ai',
          content: msg.content,
          timestamp: new Date(msg.createdAt),
          sources: msg.sources || []
        }))
        setMessages(convertedMessages)
      } else {
        setMessages([buildWelcomeMessage()])
      }

      setShowSuggestions(false)
      setStreamingMessageId(null)
      setIsLoading(false)
      setPinnedMessageIds([])
      setExpandedSnippets({})
      setComparisonSortByMessage({})
    } catch (error) {
      console.error('Failed to load session:', error)
      alert('Failed to load chat session. Please try again.')
    }
  }

  const requestDeleteSession = (targetSessionId: string) => {
    const session = chatSessions.find(s => s.id === targetSessionId)
    setDeleteConfirm({ type: 'session', id: targetSessionId, label: session?.title || 'this chat' })
  }

  const handleDeleteSession = async (targetSessionId: string) => {
    try {
      // Delete from backend
      await deleteChatSession(targetSessionId)

      // Remove from local state
      setChatSessions(prev => prev.filter(s => s.id !== targetSessionId))

      // If it's the current session, start a new chat
      if (targetSessionId === sessionId) {
        setSessionId(null)
        setMessages([buildWelcomeMessage()])
        setShowSuggestions(true)
        setVisibleSuggestions([...suggestedQueries])
        setLastUploadedFile('')
        setStreamingMessageId(null)
        setIsLoading(false)
        setPinnedMessageIds([])
        setExpandedSnippets({})
        setComparisonSortByMessage({})
        if (userId) {
          localStorage.removeItem(`currentSessionId_${userId}`)
        }
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
      alert('Failed to delete chat. Please try again.')
    }
  }

  const handleUpdateSessionTitle = async (targetSessionId: string, newTitle: string) => {
    try {
      if (!newTitle.trim()) {
        setEditingSessionId(null)
        return
      }

      // Update in backend
      await updateChatSessionTitle(targetSessionId, newTitle.trim())

      // Update local state
      setChatSessions(prev => prev.map(s =>
        s.id === targetSessionId ? { ...s, title: newTitle.trim() } : s
      ))

      setEditingSessionId(null)
      setEditingSessionTitle('')
    } catch (error) {
      console.error('Failed to update session title:', error)
      alert('Failed to rename chat. Please try again.')
    }
  }

  const handleSaveProfile = async () => {
    try {
      if (!userId) {
        console.error('User ID not found')
        return
      }

      // Save to database
      await updateUserProfile(userId, editedProfile)

      // Update local state
      setProfile(editedProfile)
      setIsEditingProfile(false)

      // Save profile updates to localStorage for backward compatibility
      localStorage.setItem('userProfile', JSON.stringify({ ...editedProfile, isProfileComplete: true }))
    } catch (error) {
      console.error('Failed to save profile:', error)
      alert('Failed to save profile. Please try again.')
    }
  }

  const handleRemovePinnedChart = (id: string) => {
    setChartSnapshots(prev => prev.filter(item => item.id !== id))
    if (activeChartId === id) {
      const remaining = chartSnapshots.filter(item => item.id !== id)
      setActiveChartId(remaining[0]?.id || null)
    }
  }

  const frameworkDocBySlot = useMemo(() => {
    const map: Partial<Record<FrameworkKey, UploadedDocument>> = {}
    for (const slot of FRAMEWORK_UPLOAD_SLOTS) {
      const match = uploadedDocuments.find(doc =>
        doc.framework === slot.key ||
        (doc.storedFilename || '').toLowerCase().startsWith(`${slot.key}_company_document`)
      )
      if (match) {
        map[slot.key] = match
      }
    }
    return map
  }, [uploadedDocuments])

  const handleFrameworkUpload = async (framework: FrameworkKey, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingFrameworks(prev => ({ ...prev, [framework]: true }))
    setUploadingFrameworkNames(prev => ({ ...prev, [framework]: file.name }))
    setLastUploadedFile(file.name)

    const frameworkLabel = FRAMEWORK_UPLOAD_SLOTS.find(slot => slot.key === framework)?.label || framework

    // Add system message about upload
    const uploadingMessage: Message = {
      id: Date.now().toString(),
      type: 'ai',
      content: `📄 Uploading ${frameworkLabel} company document: **${file.name}**...`,
      timestamp: new Date(),
      sources: []
    }
    setMessages(prev => [...prev, uploadingMessage])

    try {
      const response = await uploadFrameworkDocument(file, framework, userId || undefined)

      const sourceFilename = response.filename || file.name

      const docId = response.document_id || ''
      setUploadedDocuments(prev => {
        const filtered = prev.filter(d => d.framework !== framework)
        return [{ id: docId, filename: sourceFilename, framework }, ...filtered]
      })

      setFrameworkUploads(prev => ({ ...prev, [framework]: sourceFilename }))

      setSelectedDocumentFilter(sourceFilename)
      setDocumentOnlyMode(true)

      // Reload from DB to ensure we have real IDs for all docs
      if (userId) {
        loadUploadedDocuments(userId)
      }

      // Update the message with success
      const qualityText = response.quality
        ? `\n\nParse quality: **${response.quality.qualityLabel}** (${response.quality.qualityScore}%) | Clause coverage ${response.quality.clauseCoverage}%${response.quality.warning ? `\n${response.quality.warning}` : ''}`
        : ''
      setMessages(prev => prev.map(msg =>
        msg.id === uploadingMessage.id
          ? { ...msg, content: `✅ ${response.message}\n\nFramework scope is now set to **${frameworkLabel}** (${sourceFilename}).${qualityText}` }
          : msg
      ))

      // Auto-focus input field after successful upload
      setTimeout(() => {
        if (inputFieldRef.current) {
          inputFieldRef.current.focus()
        }
      }, 500)
    } catch (error) {
      console.error('Upload error:', error)
      setMessages(prev => prev.map(msg =>
        msg.id === uploadingMessage.id
          ? { ...msg, content: `❌ Failed to upload ${frameworkLabel} document (${file.name}). Please try again.` }
          : msg
      ))
      setLastUploadedFile('')
    } finally {
      setUploadingFrameworks(prev => ({ ...prev, [framework]: false }))
      setUploadingFrameworkNames(prev => {
        const next = { ...prev }
        delete next[framework]
        return next
      })
      // Reset file input
      if (frameworkInputRefs.current[framework]) {
        frameworkInputRefs.current[framework]!.value = ''
      }
    }
  }

  const loadUploadedDocuments = async (uid: string) => {
    try {
      const docs = (await getUserDocuments(uid))
        .filter((doc: any) => !!doc?.filename && !!doc?.framework)
        .map((doc: any) => ({
          id: doc.id as string,
          filename: doc.filename as string,
          framework: doc.framework as FrameworkKey,
          storedFilename: (doc.storedFilename || '') as string,
        }))

      // Deduplicate by filename
      const seen = new Set<string>()
      const uniqueDocs: UploadedDocument[] = []
      for (const d of docs) {
        if (!seen.has(d.filename)) {
          seen.add(d.filename)
          uniqueDocs.push(d)
        }
      }
      setUploadedDocuments(uniqueDocs)

      if (uniqueDocs.length > 0 && !selectedDocumentFilter) {
        setSelectedDocumentFilter(uniqueDocs[0].filename)
      }
      if (selectedDocumentFilter && !uniqueDocs.some(doc => doc.filename === selectedDocumentFilter)) {
        setSelectedDocumentFilter(uniqueDocs[0]?.filename || '')
      }
    } catch (error) {
      console.error('Failed to load uploaded documents:', error)
    }
  }

  const requestDeleteDocument = (documentId: string, filename: string) => {
    setDeleteConfirm({ type: 'document', id: documentId, label: filename })
  }

  const handleDeleteDocument = async (documentId: string, filename: string) => {
    try {
      await deleteUserDocument(documentId)
      setUploadedDocuments(prev => prev.filter(d => d.id !== documentId))
      setFrameworkUploads(prev => {
        const next = { ...prev }
        for (const [key, value] of Object.entries(next)) {
          if (value === filename) {
            delete next[key as FrameworkKey]
          }
        }
        return next
      })
      // If the deleted doc was the selected filter, reset
      if (selectedDocumentFilter === filename) {
        setSelectedDocumentFilter('')
        setDocumentOnlyMode(false)
      }
    } catch (error) {
      console.error('Failed to delete document:', error)
      alert('Failed to delete document. Please try again.')
    }
  }

  useEffect(() => {
    if (!userId) return
    loadUploadedDocuments(userId)
  }, [userId])

  useEffect(() => {
    setFrameworkUploads(prev => {
      const next: Partial<Record<FrameworkKey, string>> = { ...prev }
      for (const slot of FRAMEWORK_UPLOAD_SLOTS) {
        const current = frameworkDocBySlot[slot.key]
        if (current) {
          next[slot.key] = current.filename
        } else {
          delete next[slot.key]
        }
      }
      return next
    })
  }, [frameworkDocBySlot])

  const pinnedMessages = pinnedMessageIds
    .map(id => messages.find(message => message.id === id && message.type === 'ai'))
    .filter((message): message is Message => Boolean(message))

  // ── Register data with assistant context ──
  const assistantContext = useAssistantContext();

  // Set current page on mount
  useEffect(() => {
    assistantContext.setCurrentPage("chat");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync active chat id
  useEffect(() => {
    assistantContext.setActiveChatId(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Sync chat history
  useEffect(() => {
    if (chatSessions && chatSessions.length > 0) {
      assistantContext.setChatHistory(
        chatSessions.map((s: any) => ({ id: s.id, title: s.title || "Untitled" }))
      );
    } else {
      assistantContext.setChatHistory([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatSessions]);

  const chatVisuals = useMemo(() => {
    const v: { id: string; type: "bar" | "line" | "pie"; title: string; data: Record<string, unknown>[]; unit?: string }[] = [];
    if (chartData.length > 0) {
      v.push({ id: "chat-chart", type: chartType as "bar" | "line" | "pie", title: "Chat Chart", data: chartData as unknown as Record<string, unknown>[], unit: chartUnit });
    }
    // Also register saved chart snapshots
    chartSnapshots.forEach((snap) => {
      v.push({ id: `chat-snap-${snap.id}`, type: snap.type as "bar" | "line" | "pie", title: snap.title, data: snap.data as unknown as Record<string, unknown>[], unit: snap.unit });
    });
    return v;
  }, [chartData, chartType, chartUnit, chartSnapshots]);

  const chatSummaries = useMemo(() => {
    const s = [];
    s.push({ id: "chat-messages", label: "Messages in session", value: messages.length });
    if (chartSnapshots.length > 0) s.push({ id: "chat-snapshots", label: "Chart Snapshots", value: chartSnapshots.length });
    if (bookmarks.length > 0) s.push({ id: "chat-bookmarks", label: "Bookmarked Messages", value: bookmarks.length });
    return s;
  }, [messages.length, chartSnapshots.length, bookmarks.length]);

  useRegisterAssistantData({ page: "chat", visuals: chatVisuals, summaries: chatSummaries });

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Toggle Left Sidebar Button */}
      <button
        onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-20 bg-white border border-border/40 rounded-r-lg p-2 shadow-lg hover:bg-slate-50 transition-all"
        style={{ marginLeft: isLeftSidebarOpen ? '16rem' : '0' }}
      >
        {isLeftSidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {/* Left Sidebar - Profile & History */}
      {isLeftSidebarOpen && (
        <div data-assistant-id="sidebar" className="w-64 border-r border-border bg-gradient-to-b from-slate-50 to-white flex flex-col overflow-hidden shadow-sm transition-all duration-300">
          <div className="p-4 border-b border-border/40">
            <Link href="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity mb-4">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium text-foreground">Back Home</span>
            </Link>

            <Button className="w-full mb-4 gap-2" onClick={handleNewChat}>
              <Plus className="w-4 h-4" />
              New Chat
            </Button>

            <Button
              variant="outline"
              className="w-full mb-4 gap-2"
              onClick={handleClearChat}
            >
              <RefreshCw className="w-4 h-4" />
              Clear Chat
            </Button>

            <Card className="p-4 bg-white border border-border/40">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Your Profile</span>
                </div>
                <Dialog open={isEditingProfile} onOpenChange={setIsEditingProfile}>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-primary/10"
                      onClick={() => setEditedProfile(profile)}
                      title="Edit Profile"
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit Profile</DialogTitle>
                      <DialogDescription>
                        Update your profile for personalized financial advice. <span className="text-red-500">*</span> = Required
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-6 py-4">
                      {/* COMPULSORY FIELDS */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <span className="text-red-500">*</span> Basic Information
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="age"><span className="text-red-500">*</span> Age</Label>
                            <Input
                              id="age"
                              type="number"
                              required
                              value={editedProfile.age}
                              onChange={(e) => setEditedProfile({ ...editedProfile, age: parseInt(e.target.value) || 0 })}
                            />
                          </div>

                          <div className="grid gap-2" >
                            <Label htmlFor="gender"><span className='text-red-500' >*</span> Gender</Label>
                            <Select
                              value={editedProfile.gender}
                              onValueChange={(value) => setEditedProfile({ ...editedProfile, gender: value })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Male">Male</SelectItem>
                                <SelectItem value="Female">Female</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid gap-2">
                            <Label htmlFor="income"><span className="text-red-500">*</span> Annual Income</Label>
                            <Input
                              id="income"
                              required
                              value={editedProfile.income}
                              onChange={(e) => setEditedProfile({ ...editedProfile, income: e.target.value })}
                              placeholder="e.g., ₹15 LPA"
                            />
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="employmentStatus"><span className="text-red-500">*</span> Employment Status</Label>
                          <Select
                            value={editedProfile.employmentStatus}
                            onValueChange={(value) => setEditedProfile({ ...editedProfile, employmentStatus: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Salaried - Government">Salaried - Government</SelectItem>
                              <SelectItem value="Salaried - Private">Salaried - Private</SelectItem>
                              <SelectItem value="Self-Employed">Self-Employed</SelectItem>
                              <SelectItem value="Business Owner">Business Owner</SelectItem>
                              <SelectItem value="Retired">Retired</SelectItem>
                              <SelectItem value="Unemployed">Unemployed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="taxRegime"><span className="text-red-500">*</span> Tax Regime</Label>
                          <Select
                            value={editedProfile.taxRegime}
                            onValueChange={(value) => setEditedProfile({ ...editedProfile, taxRegime: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Old Regime">Old Regime (with deductions)</SelectItem>
                              <SelectItem value="New Regime">New Regime (lower rates)</SelectItem>
                              <SelectItem value="Not Sure">Not Sure / Need Help</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="homeownerStatus"><span className="text-red-500">*</span> Housing Status</Label>
                          <Select
                            value={editedProfile.homeownerStatus}
                            onValueChange={(value) => setEditedProfile({ ...editedProfile, homeownerStatus: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Own - With Loan">Own House (with home loan)</SelectItem>
                              <SelectItem value="Own - No Loan">Own House (fully paid)</SelectItem>
                              <SelectItem value="Rented">Rented Accommodation</SelectItem>
                              <SelectItem value="Living with Family">Living with Family</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* OPTIONAL FIELDS */}
                      <div className="space-y-4 pt-4 border-t">
                        <h3 className="text-sm font-semibold text-foreground">Optional Information (for better recommendations)</h3>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="children">Number of Children</Label>
                            <Input
                              id="children"
                              type="number"
                              value={editedProfile.children}
                              onChange={(e) => setEditedProfile({ ...editedProfile, children: e.target.value })}
                              placeholder="0"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="childrenAges">Children Ages</Label>
                            <Input
                              id="childrenAges"
                              value={editedProfile.childrenAges}
                              onChange={(e) => setEditedProfile({ ...editedProfile, childrenAges: e.target.value })}
                              placeholder="e.g., 5, 8"
                            />
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="parentsAge">Parents Age</Label>
                          <Input
                            id="parentsAge"
                            value={editedProfile.parentsAge}
                            onChange={(e) => setEditedProfile({ ...editedProfile, parentsAge: e.target.value })}
                            placeholder="e.g., Father 65, Mother 60"
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="investmentCapacity">Annual Investment Capacity</Label>
                          <Select
                            value={editedProfile.investmentCapacity}
                            onValueChange={(value) => setEditedProfile({ ...editedProfile, investmentCapacity: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select range" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="₹0-50k">₹0 - ₹50,000</SelectItem>
                              <SelectItem value="₹50k-1L">₹50,000 - ₹1 Lakh</SelectItem>
                              <SelectItem value="₹1L-2.5L">₹1 Lakh - ₹2.5 Lakhs</SelectItem>
                              <SelectItem value="₹2.5L-5L">₹2.5 Lakhs - ₹5 Lakhs</SelectItem>
                              <SelectItem value="₹5L+">₹5 Lakhs+</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="riskAppetite">Risk Appetite</Label>
                          <Select
                            value={editedProfile.riskAppetite}
                            onValueChange={(value) => setEditedProfile({ ...editedProfile, riskAppetite: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select risk level" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Conservative">Conservative (Fixed returns only)</SelectItem>
                              <SelectItem value="Moderate">Moderate (Balanced approach)</SelectItem>
                              <SelectItem value="Aggressive">Aggressive (Market-linked returns)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => setIsEditingProfile(false)} variant="outline">Cancel</Button>
                      <Button onClick={handleSaveProfile}>Save Profile</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p><span className="font-medium text-foreground">Age:</span> {profile.age} {profile.age >= 60 && '👴'}</p>
                <p><span className="font-medium text-foreground">Gender:</span> {profile.gender}</p>
                <p><span className="font-medium text-foreground">Income:</span> {profile.income}</p>
                <p><span className="font-medium text-foreground">Status:</span> {profile.employmentStatus}</p>
                <p><span className="font-medium text-foreground">Tax:</span> {profile.taxRegime}</p>
                <p><span className="font-medium text-foreground">Home:</span> {profile.homeownerStatus}</p>
                {profile.children && <p><span className="font-medium text-foreground">Children:</span> {profile.children}</p>}
              </div>
            </Card>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <h3 className="text-xs font-bold text-muted-foreground mb-3 uppercase tracking-wide">Chat History</h3>
              <div className="space-y-2">
                {chatSessions && chatSessions.length > 0 ? (
                  chatSessions.map((session: any) => (
                    <div
                      key={session.id}
                      onClick={() => editingSessionId !== session.id && handleLoadSession(session.id, session.title)}
                      className={`w-full text-left p-3 rounded-lg text-xs transition-colors border group cursor-pointer ${sessionId === session.id
                        ? 'border-primary/40 bg-primary/5 text-foreground'
                        : 'text-muted-foreground hover:bg-primary/5 hover:text-foreground border-transparent hover:border-border/40'
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {editingSessionId === session.id ? (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <Input
                                value={editingSessionTitle}
                                onChange={(e) => setEditingSessionTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleUpdateSessionTitle(session.id, editingSessionTitle)
                                  } else if (e.key === 'Escape') {
                                    setEditingSessionId(null)
                                  }
                                }}
                                className="h-6 text-xs px-2"
                                autoFocus
                              />
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => handleUpdateSessionTitle(session.id, editingSessionTitle)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    handleUpdateSessionTitle(session.id, editingSessionTitle)
                                  }
                                }}
                                className="p-1 rounded hover:bg-green-500/20 text-green-600 cursor-pointer"
                                title="Save"
                              >
                                <Check className="w-3 h-3" />
                              </div>
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => setEditingSessionId(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    setEditingSessionId(null)
                                  }
                                }}
                                className="p-1 rounded hover:bg-red-500/20 text-red-500 cursor-pointer"
                                title="Cancel"
                              >
                                <X className="w-3 h-3" />
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="line-clamp-2 break-words">{session.title || 'New Chat'}</p>
                              <p className="text-xs opacity-50 mt-1">
                                {new Date(session.createdAt).toLocaleDateString('en-IN')}
                              </p>
                            </>
                          )}
                        </div>
                        {editingSessionId !== session.id && (
                          <div className="flex items-center gap-1">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingSessionId(session.id)
                                setEditingSessionTitle(session.title || 'New Chat')
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.stopPropagation()
                                  setEditingSessionId(session.id)
                                  setEditingSessionTitle(session.title || 'New Chat')
                                }
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-primary/20 text-muted-foreground hover:text-foreground cursor-pointer"
                              title="Rename chat"
                            >
                              <Pencil className="w-3 h-3" />
                            </div>
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation()
                                requestDeleteSession(session.id)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.stopPropagation()
                                  requestDeleteSession(session.id)
                                }
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/20 text-red-500 cursor-pointer"
                              title="Delete chat"
                            >
                              <X className="w-3 h-3" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground/60 py-2">No chat history yet</p>
                )}
              </div>
            </div>

            {chartSnapshots.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-muted-foreground mb-3 uppercase tracking-wide">Pinned Charts</h3>
                <div className="space-y-2">
                  {chartSnapshots.map(snapshot => (
                    <button
                      key={snapshot.id}
                      onClick={() => {
                        setChartMode('response')
                        setActiveChartId(snapshot.id)
                      }}
                      className={`w-full text-left p-2 rounded-lg text-xs transition-colors border ${activeChartId === snapshot.id
                        ? 'border-primary/40 bg-primary/5 text-foreground'
                        : 'border-transparent text-muted-foreground hover:bg-primary/5'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Pin className="h-3 w-3 text-primary shrink-0" />
                          <span className="truncate">{snapshot.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground uppercase">{snapshot.type}</span>
                          <div
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              handleRemovePinnedChart(snapshot.id)
                            }}
                            className="p-1 rounded hover:bg-muted cursor-pointer"
                            title="Remove pinned chart"
                            role="button"
                            tabIndex={0}
                          >
                            <X className="h-3 w-3 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {uploadedDocuments.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-muted-foreground mb-3 uppercase tracking-wide">Uploaded Documents</h3>
                <div className="space-y-2">
                  {uploadedDocuments.map((doc, i) => (
                    <div
                      key={`${doc.id || doc.filename}-${i}`}
                      className={`group relative w-full text-left p-2 rounded-lg text-xs transition-colors border cursor-pointer ${selectedDocumentFilter === doc.filename && documentOnlyMode
                        ? 'border-primary/40 bg-primary/5 text-foreground'
                        : 'border-transparent text-muted-foreground hover:bg-primary/5'
                        }`}
                      onClick={() => {
                        setSelectedDocumentFilter(doc.filename)
                        setDocumentOnlyMode(true)
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate flex-1">{doc.filename}</span>
                        {doc.id && (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation()
                              requestDeleteDocument(doc.id, doc.filename)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.stopPropagation()
                                requestDeleteDocument(doc.id, doc.filename)
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/20 text-red-500 cursor-pointer"
                            title="Delete document"
                          >
                            <X className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-xs font-bold text-muted-foreground mb-3 uppercase tracking-wide">Categories</h3>
              <div className="space-y-2">
                {[
                  { label: 'Income Tax', icon: '📊' },
                  { label: 'Investments', icon: '💰' },
                  { label: 'Pensions', icon: '👴' },
                  { label: 'Govt Schemes', icon: '🏛️' }
                ].map((cat, i) => (
                  <button key={i} className="w-full text-left p-2 rounded-lg text-xs text-muted-foreground hover:bg-primary/5 transition-colors">
                    <span className="mr-2">{cat.icon}</span> {cat.label}
                  </button>
                ))}
              </div>
            </div>
          </div>


        </div>
      )}

      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={75} minSize={50} className="min-w-[320px] min-h-0">
          {/* Main Chat Area */}
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {/* Header */}
            <div className="border-b border-border/40 bg-white p-1 md:p-2 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <Link href="/" className="lg:hidden">
                  <Button variant="ghost" size="icon" className="hover:bg-primary/10">
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                </Link>
                <Logo size="md" showText={false} href="/" />
                <div>
                  <h2 className="text-base font-bold text-foreground">Arth-Mitra Chat</h2>
                  <p className="text-xs text-muted-foreground">Arth Mitra Financial Assistant</p>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">Income- Rs.{profile.income}</p>
                  <p className="text-xs text-muted-foreground">Age- {profile.age} years</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={exportChatAsHtml}
                  title="Export chat as HTML"
                >
                  <FileText className="w-4 h-4" />
                  HTML
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={exportChatAsPdf}
                  title="Export chat as PDF"
                >
                  <Download className="w-4 h-4" />
                  PDF
                </Button>
                <Button variant="ghost" size="icon" className="hover:bg-primary/10">
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <UserMenu />
              </div>
            </div>

            {/* Messages Area */}
            <div className="relative flex-1 min-h-0">
              <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                onWheelCapture={handleMessagesWheelCapture}
                className="h-full min-h-0 overflow-x-hidden overflow-y-scroll p-4 md:p-6 space-y-6"
              >
                {pinnedMessages.length > 0 && (
                  <div className="max-w-4xl rounded-xl border border-amber-300/50 bg-amber-50/60 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-amber-800">📌 Pinned answers</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setPinnedMessageIds([])}
                      >
                        Clear all
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {pinnedMessages.map((pinnedMessage) => (
                        <div key={`pinned-${pinnedMessage.id}`} className="rounded-md border border-amber-200 bg-white p-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-3 text-sm text-foreground">{pinnedMessage.content}</p>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  const element = document.getElementById(`msg-${pinnedMessage.id}`)
                                  element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                }}
                                title="Jump to message"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => togglePinMessage(pinnedMessage.id)}
                                title="Unpin"
                              >
                                <Pin className="h-3.5 w-3.5 text-amber-700" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {messages.length === 1 && showSuggestions && (
                  <div className="space-y-4 max-w-3xl">
                    <div className="text-center py-6">
                      <div className="text-3xl mb-3">💡</div>
                      <h2 className="text-xl font-bold text-foreground mb-2">What would you like to know?</h2>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto">Ask me anything about Indian taxes, investment schemes, or financial planning.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-3">
                      {suggestedQueries.map((query, i) => (
                        <button
                          key={i}
                          onClick={() => handleSuggestedQuery(query.text)}
                          className="text-left p-4 rounded-xl border border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all group"
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-lg">
                              {query.category === 'tax' && '📊'}
                              {query.category === 'pension' && '👴'}
                              {query.category === 'investment' && '💰'}
                            </span>
                            <p className="text-sm text-foreground group-hover:text-primary font-medium transition-colors">{query.text}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    id={`msg-${message.id}`}
                    className={`flex animate-in fade-in-50 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[min(92%,64rem)] flex gap-3 ${message.type === 'user' ? 'flex-row-reverse' : 'flex-row'
                        }`}
                    >
                      {message.type === 'ai' && (
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center flex-shrink-0 shadow-md">
                          <span className="text-white font-bold text-sm">AM</span>
                        </div>
                      )}

                      <div>
                        <div
                          className={`rounded-2xl px-4 py-3 shadow-sm ${message.type === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-none'
                            : 'bg-muted text-foreground rounded-bl-none border border-border/40'
                            }`}
                        >
                          {message.type === 'ai' && (
                            <div className="mb-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${message.queryScope === 'selected'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-green-50 text-green-700'
                                }`}>
                                {message.queryScope === 'selected' && message.queryDocument
                                  ? <SourceWithTooltip source={message.queryDocument} maxLength={40} className="max-w-[20rem] truncate" prefix="Selected document: " />
                                  : 'All documents'}
                              </span>
                              {typeof message.confidence === 'number' && (
                                <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${message.confidenceLabel === 'high'
                                  ? 'bg-green-100 text-green-700'
                                  : message.confidenceLabel === 'medium'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-red-100 text-red-700'
                                  }`}>
                                  Confidence: {Math.round(message.confidence * 100)}%
                                </span>
                              )}
                              {message.ragMetrics && (
                                <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700">
                                  RAG chunks: C {message.ragMetrics.companyChunks} | O {message.ragMetrics.baselineChunks}
                                </span>
                              )}
                            </div>
                          )}
                          {message.type === 'user' ? (
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <MarkdownMessage content={message.content} />
                            </div>
                          )}
                          <p className={`text-xs mt-2 ${message.type === 'user'
                            ? 'text-primary-foreground/70'
                            : 'text-muted-foreground'
                            }`} suppressHydrationWarning>
                            {message.timestamp.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false
                            })}
                          </p>
                        </div>

                        {message.type === 'ai' && message.sources && message.sources.length > 0 && (
                          <div className="mt-2 text-sm text-muted-foreground flex flex-wrap items-start gap-2 ml-3">
                            <span className="shrink-0">📚 Sources:</span>
                            {message.sources.map((source, i) => (
                              <SourceWithTooltip
                                key={i}
                                source={source}
                                onClick={() => handleSourceChipClick(source)}
                                className="inline-flex max-w-[16rem] truncate rounded-md bg-muted/70 px-2 py-0.5 text-primary font-medium hover:bg-primary/10 cursor-pointer"
                              />
                            ))}
                          </div>
                        )}

                        {message.type === 'ai' && message.whyThisAnswer && (
                          <div className="mt-2 rounded-xl border border-border/40 bg-background p-3 text-sm">
                            <p className="font-semibold text-foreground mb-1">Why this answer</p>
                            <p className="text-muted-foreground leading-relaxed">{message.whyThisAnswer}</p>
                          </div>
                        )}

                        {message.type === 'ai' && message.ragMetrics && (
                          <div className="mt-2 rounded-xl border border-border/40 bg-background p-3 text-sm">
                            <p className="font-semibold text-foreground mb-2">RAG retrieval metrics</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                              <div className="rounded bg-muted/60 p-2"><span className="text-muted-foreground">Company chunks</span><p className="font-semibold">{message.ragMetrics.companyChunks}</p></div>
                              <div className="rounded bg-muted/60 p-2"><span className="text-muted-foreground">Original ISO chunks</span><p className="font-semibold">{message.ragMetrics.baselineChunks}</p></div>
                              <div className="rounded bg-muted/60 p-2"><span className="text-muted-foreground">Total chunks</span><p className="font-semibold">{message.ragMetrics.totalChunks}</p></div>
                              <div className="rounded bg-muted/60 p-2"><span className="text-muted-foreground">Chunk ratio C:O</span><p className="font-semibold">{message.ragMetrics.companyToBaselineChunkRatio ?? 'n/a'}</p></div>
                            </div>
                          </div>
                        )}

                        {message.type === 'ai' && message.clauseValidation && (
                          <div className={`mt-2 rounded-xl border p-3 text-sm ${message.clauseValidation.isValid ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/70'}`}>
                            <p className="font-semibold text-foreground mb-1">Clause grounding validator</p>
                            <p className="text-xs text-muted-foreground">{message.clauseValidation.message}</p>
                            {!message.clauseValidation.isValid && message.clauseValidation.unsupportedClauses.length > 0 && (
                              <p className="text-xs text-amber-700 mt-1">Unsupported clauses: {message.clauseValidation.unsupportedClauses.join(', ')}</p>
                            )}
                          </div>
                        )}

                        {message.type === 'ai' && message.sectionConfidence && Object.keys(message.sectionConfidence).length > 0 && (
                          <div className="mt-2 rounded-xl border border-border/40 bg-background p-3 text-sm">
                            <p className="font-semibold text-foreground mb-2">Section confidence</p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                              {Object.entries(message.sectionConfidence).map(([section, score]) => (
                                <div key={section} className="rounded bg-muted/60 p-2">
                                  <p className="text-muted-foreground capitalize">{section}</p>
                                  <p className="font-semibold">{Math.round((score || 0) * 100)}%</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {message.type === 'ai' && message.rubricScores && Object.keys(message.rubricScores).length > 0 && (
                          <div className="mt-2 rounded-xl border border-border/40 bg-background p-3 text-sm">
                            <p className="font-semibold text-foreground mb-2">Framework rubric coverage</p>
                            <div className="space-y-2">
                              {Object.entries(message.rubricScores).map(([framework, rubric]) => (
                                <div key={framework} className="rounded-md bg-muted/60 p-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-semibold uppercase">{framework}</p>
                                    <span className="text-xs text-muted-foreground">Weighted coverage {rubric.coverageWeightedPct}%</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">{rubric.title}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {message.type === 'ai' && message.evidenceTrace && message.evidenceTrace.length > 0 && (
                          <div className="mt-2 rounded-xl border border-border/40 bg-background p-3 text-sm">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="font-semibold text-foreground">Evidence trace panel</p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => toggleLowEvidence(message.id)}
                              >
                                {showLowEvidenceByMessage[message.id] ? 'Hide low-quality' : 'Show low-quality'}
                              </Button>
                            </div>
                            <div className="space-y-2">
                              {message.evidenceTrace
                                .filter(item => showLowEvidenceByMessage[message.id] || !isLowEvidence(item.evidenceStrength))
                                .slice(0, 8)
                                .map((item, idx) => (
                                  <div key={`${message.id}-trace-${idx}`} className="rounded-md bg-muted/60 p-2">
                                    <p className="text-xs font-semibold">{item.framework} Clause {item.clause} • {item.sourceType}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{item.source} • Strength: {item.evidenceStrength}</p>
                                    <p className="text-xs mt-1 text-foreground/90">{cleanSnippetText(item.snippet)}</p>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {message.type === 'ai' && message.clauseHeatmap && message.clauseHeatmap.length > 0 && (
                          <div className="mt-2 rounded-xl border border-border/40 bg-background p-3 text-sm">
                            <p className="font-semibold text-foreground mb-2">Clause coverage heatmap</p>
                            <div className="space-y-2">
                              {message.clauseHeatmap.map((row) => (
                                <div key={row.framework} className="rounded-md bg-muted/60 p-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="font-semibold uppercase text-xs">{row.framework}</p>
                                    <span className="text-xs text-muted-foreground">Coverage {row.coveragePct}%</span>
                                  </div>
                                  <div className="mt-1 h-2 w-full rounded bg-muted">
                                    <div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, row.coveragePct))}%` }} />
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">Missing evidence: {row.missingEvidenceCount} | Strong: {row.strongEvidenceCount} | Medium: {row.mediumEvidenceCount} | Weak: {row.weakEvidenceCount}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {message.type === 'ai' && message.askBackQuestions && message.askBackQuestions.length > 0 && (
                          <div className="mt-2 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-sm">
                            <p className="font-semibold text-foreground mb-2">Need clarifications before final scoring</p>
                            <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                              {message.askBackQuestions.slice(0, 3).map((q, idx) => (
                                <li key={`${message.id}-ask-${idx}`}>{q}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {message.type === 'ai' && message.contradictions && message.contradictions.length > 0 && (
                          <div className="mt-2 rounded-xl border border-red-200 bg-red-50/70 p-3 text-sm">
                            <p className="font-semibold text-foreground mb-2">Contradiction detector</p>
                            <div className="space-y-2">
                              {message.contradictions.slice(0, 4).map((item, idx) => (
                                <div key={`${item.clause}-${idx}`} className="rounded-md bg-white p-2 border border-red-100">
                                  <p className="text-xs font-semibold text-red-700">Clause {item.clause}</p>
                                  <p className="text-xs text-muted-foreground mt-1">{item.issue}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {message.type === 'ai' && message.freshnessTracker && message.freshnessTracker.length > 0 && (
                          <div className="mt-2 rounded-xl border border-border/40 bg-background p-3 text-sm">
                            <p className="font-semibold text-foreground mb-2">Version and freshness tracker</p>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              {message.freshnessTracker.slice(0, 6).map((item, idx) => (
                                <p key={`${item.source}-${idx}`}>
                                  {item.source} ({item.sourceType}) - {item.effectiveDate || 'unknown'} {item.stale ? ' - stale' : ''}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {message.type === 'ai' && message.actionPlan306090 && (
                          <div className="mt-2 rounded-xl border border-border/40 bg-background p-3 text-sm">
                            <p className="font-semibold text-foreground mb-2">30/60/90 action plan</p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                              <div className="rounded bg-muted/60 p-2">
                                <p className="font-semibold mb-1">30 days</p>
                                {(message.actionPlan306090.d30 || []).slice(0, 3).map((a, i) => <p key={`d30-${i}`}>• {a.action}</p>)}
                              </div>
                              <div className="rounded bg-muted/60 p-2">
                                <p className="font-semibold mb-1">60 days</p>
                                {(message.actionPlan306090.d60 || []).slice(0, 3).map((a, i) => <p key={`d60-${i}`}>• {a.action}</p>)}
                              </div>
                              <div className="rounded bg-muted/60 p-2">
                                <p className="font-semibold mb-1">90 days</p>
                                {(message.actionPlan306090.d90 || []).slice(0, 3).map((a, i) => <p key={`d90-${i}`}>• {a.action}</p>)}
                              </div>
                            </div>
                          </div>
                        )}

                        {message.type === 'ai' && message.clauseDrilldown && message.clauseDrilldown.length > 0 && (
                          <div className="mt-2 rounded-xl border border-border/40 bg-background p-3 text-sm">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="font-semibold text-foreground">Clause drill-down (company vs ISO)</p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => toggleLowEvidence(message.id)}
                              >
                                {showLowEvidenceByMessage[message.id] ? 'Hide low-quality' : 'Show low-quality'}
                              </Button>
                            </div>
                            <div className="space-y-2">
                              {message.clauseDrilldown.slice(0, 5).map((row) => (
                                <div key={row.clause} className="rounded-md bg-muted/60 p-2">
                                  <p className="text-xs font-semibold mb-1">Clause {row.clause}</p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <div>
                                      <p className="text-[11px] font-semibold text-emerald-700">Company</p>
                                      {(row.company || [])
                                        .filter(s => showLowEvidenceByMessage[message.id] || !isLowEvidence(s.evidenceStrength))
                                        .slice(0, 1)
                                        .map((s, i) => <p key={`c-${i}`} className="text-xs text-muted-foreground">{cleanSnippetText(s.snippet)}</p>)}
                                    </div>
                                    <div>
                                      <p className="text-[11px] font-semibold text-blue-700">Baseline ISO</p>
                                      {(row.baseline || [])
                                        .filter(s => showLowEvidenceByMessage[message.id] || !isLowEvidence(s.evidenceStrength))
                                        .slice(0, 1)
                                        .map((s, i) => <p key={`b-${i}`} className="text-xs text-muted-foreground">{cleanSnippetText(s.snippet)}</p>)}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {message.type === 'ai' && message.followupPrompts && message.followupPrompts.length > 0 && (
                          <div className="mt-2 rounded-xl border border-border/40 bg-background p-3 text-sm">
                            <p className="font-semibold text-foreground mb-2">Suggested follow-up prompts</p>
                            <div className="flex flex-wrap gap-2">
                              {message.followupPrompts.slice(0, 3).map((prompt, idx) => (
                                <Button key={`${message.id}-follow-${idx}`} variant="outline" size="sm" onClick={() => handleFollowupPrompt(prompt)}>
                                  {prompt}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}

                        {message.type === 'ai' && ((message.missingDetails && message.missingDetails.length > 0) || (message.improvementSuggestions && message.improvementSuggestions.length > 0)) && (
                          <div className="mt-2 rounded-xl border border-amber-300/50 bg-amber-50/60 p-3 text-sm">
                            <p className="font-semibold text-foreground mb-2">What is missing and how to improve</p>
                            {message.missingDetails && message.missingDetails.length > 0 && (
                              <div className="mb-2">
                                <p className="text-xs font-semibold text-amber-800 mb-1">Missing</p>
                                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                                  {message.missingDetails.slice(0, 4).map((item, idx) => (
                                    <li key={`${message.id}-missing-${idx}`}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {message.improvementSuggestions && message.improvementSuggestions.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-emerald-800 mb-1">Improve</p>
                                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                                  {message.improvementSuggestions.slice(0, 4).map((item, idx) => (
                                    <li key={`${message.id}-improve-${idx}`}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {message.type === 'ai' && message.highlights && message.highlights.length > 0 && (
                          <div className="mt-2 rounded-xl border border-border/40 bg-background p-3 text-sm">
                            <p className="font-semibold text-foreground mb-2">Source highlights</p>
                            <div className="space-y-2">
                              {message.highlights.slice(0, 3).map((item, idx) => (
                                <div key={`${item.source}-${idx}`} className="rounded-md bg-muted/60 p-2">
                                  <SourceWithTooltip source={item.source} className="block text-sm font-semibold text-primary truncate" />
                                  {(() => {
                                    const snippetKey = `${message.id}-${idx}`
                                    const cleanedSnippet = cleanSnippetText(item.snippet)
                                    const expanded = !!expandedSnippets[snippetKey]
                                    const shouldCollapse = cleanedSnippet.length > 220
                                    return (
                                      <>
                                        <p className={`text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap break-words ${!expanded && shouldCollapse ? 'line-clamp-2' : ''}`}>
                                          {cleanedSnippet}
                                        </p>
                                        {shouldCollapse && (
                                          <button
                                            type="button"
                                            className="mt-1 text-xs font-medium text-primary hover:underline"
                                            onClick={() => toggleSnippet(message.id, idx)}
                                          >
                                            {expanded ? 'Show less' : 'Show full snippet'}
                                          </button>
                                        )}
                                      </>
                                    )
                                  })()}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {message.type === 'ai' && message.documentInsights && message.documentInsights.length > 0 && (
                          <div className="mt-2 rounded-xl border border-border/40 bg-background p-3 text-sm">
                            <p className="font-semibold text-foreground mb-2">Document insights</p>
                            <div className="space-y-2">
                              {message.documentInsights.slice(0, 5).map((insight, idx) => (
                                <div key={`${insight.field}-${idx}`} className="rounded-md bg-muted/60 p-2">
                                  <p className="text-sm font-semibold text-primary">{insight.field}</p>
                                  <p className="text-muted-foreground mt-1">{insight.value}</p>
                                  <SourceWithTooltip
                                    source={insight.source}
                                    className="block text-xs text-muted-foreground/90 mt-1 truncate"
                                    prefix="Source: "
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}


                        {message.type === 'ai' && message.comparison && (
                          <div className="mt-2 rounded-xl border border-border/40 bg-background p-3 text-sm">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="font-semibold text-foreground">Scheme comparison</p>
                              <Select
                                value={comparisonSortByMessage[message.id] || 'default'}
                                onValueChange={(value) => {
                                  setComparisonSortByMessage(prev => ({
                                    ...prev,
                                    [message.id]: value as ComparisonSort,
                                  }))
                                }}
                              >
                                <SelectTrigger className="h-7 w-[9rem] text-xs">
                                  <SelectValue placeholder="Sort fields" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="default">Default order</SelectItem>
                                  <SelectItem value="field-asc">Field A-Z</SelectItem>
                                  <SelectItem value="field-desc">Field Z-A</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="max-h-72 overflow-auto">
                              <table className="w-full text-left text-sm">
                                <thead className="sticky top-0 z-10 bg-background">
                                  <tr className="text-muted-foreground">
                                    <th className="py-1 pr-2">Field</th>
                                    <th className="py-1 px-2">{message.comparison.schemeA.name}</th>
                                    <th className="py-1 pl-2">{message.comparison.schemeB.name}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {getComparisonRows(message).map((row) => (
                                    <tr key={row.field} className="align-top">
                                      <td className="py-1 pr-2 font-medium">{row.field}</td>
                                      {row.wide ? (
                                        <td className="py-1 px-2" colSpan={2}>{row.a}</td>
                                      ) : (
                                        <>
                                          <td className="py-1 px-2">{row.a}</td>
                                          <td className="py-1 pl-2">{row.b}</td>
                                        </>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                      </div>

                      {message.type === 'ai' && (
                        <div className="flex gap-1 mt-1">
                          <button
                            onClick={() => handleCopySources(message)}
                            className="flex-shrink-0 p-2 hover:bg-muted rounded-lg transition-colors"
                            title="Copy sources"
                            disabled={!message.sources || message.sources.length === 0}
                          >
                            {copiedSourcesMessageId === message.id ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className={`w-4 h-4 ${message.sources && message.sources.length > 0 ? 'text-muted-foreground' : 'text-muted-foreground/40'}`} />
                            )}
                          </button>
                          <button
                            onClick={() => togglePinMessage(message.id)}
                            className="flex-shrink-0 p-2 hover:bg-muted rounded-lg transition-colors"
                            title={pinnedMessageIds.includes(message.id) ? 'Unpin answer' : 'Pin answer to top'}
                          >
                            <Pin
                              className={`w-4 h-4 ${pinnedMessageIds.includes(message.id)
                                ? 'fill-amber-500 text-amber-600'
                                : 'text-muted-foreground'
                                }`}
                            />
                          </button>
                          <button
                            onClick={() => toggleBookmark(message.id)}
                            className="flex-shrink-0 p-2 hover:bg-muted rounded-lg transition-colors"
                            title={bookmarks.includes(message.id) ? 'Remove bookmark' : 'Save bookmark'}
                          >
                            <Bookmark
                              className={`w-4 h-4 ${bookmarks.includes(message.id)
                                ? 'fill-accent text-accent'
                                : 'text-muted-foreground'
                                }`}
                            />
                          </button>
                          <button
                            onClick={() => handleFeedback(message.id, 'positive')}
                            className="flex-shrink-0 p-2 hover:bg-muted rounded-lg transition-colors"
                            title="Helpful answer"
                            disabled={!!feedbackLoading[message.id]}
                          >
                            <ThumbsUp className={`w-4 h-4 ${feedbackByMessage[message.id] === 'positive' ? 'text-emerald-600 fill-emerald-500/20' : 'text-muted-foreground'}`} />
                          </button>
                          <button
                            onClick={() => handleFeedback(message.id, 'negative')}
                            className="flex-shrink-0 p-2 hover:bg-muted rounded-lg transition-colors"
                            title="Needs improvement"
                            disabled={!!feedbackLoading[message.id]}
                          >
                            <ThumbsDown className={`w-4 h-4 ${feedbackByMessage[message.id] === 'negative' ? 'text-red-600 fill-red-500/20' : 'text-muted-foreground'}`} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isLoading && !streamingMessageId && (
                  <div className="flex justify-start">
                    <div className="flex gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-sm">AM</span>
                      </div>
                      <div className="bg-muted rounded-2xl px-5 py-4 border border-border/40">
                        <div className="flex gap-2">
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce delay-100" />
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce delay-200" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              {showJumpToLatest && (
                <div className="absolute bottom-4 right-4 z-10">
                  <Button type="button" size="sm" onClick={handleJumpToLatest}>
                    <ArrowDown className="w-4 h-4 mr-1" />
                    Jump to latest
                  </Button>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="sticky bottom-0 z-10 border-t border-border/40 bg-white p-4 md:p-6 shadow-lg">
              {uploadedDocuments.length > 0 && (
                <div className="max-w-4xl mx-auto mb-3 flex flex-col md:flex-row gap-2 md:items-center">
                  <Button
                    type="button"
                    variant={documentOnlyMode ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDocumentOnlyMode(prev => !prev)}
                  >
                    {documentOnlyMode ? 'Document-only: ON' : 'Document-only: OFF'}
                  </Button>
                  <div className="w-full md:w-96">
                    <Select
                      value={selectedDocumentFilter || uploadedDocuments[0]?.filename}
                      onValueChange={setSelectedDocumentFilter}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select uploaded document" />
                      </SelectTrigger>
                      <SelectContent>
                        {uploadedDocuments.map((doc) => (
                          <SelectItem key={doc.id} value={doc.filename}>
                            {doc.filename}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              {uploadedDocuments.length > 0 && !documentOnlyMode && (
                <div className="max-w-4xl mx-auto mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Document-only mode is OFF. Answers may use all indexed documents, not just the selected file.
                </div>
              )}
              <div className="max-w-4xl mx-auto mb-2 rounded-xl border border-border/60 bg-white p-2 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">ISO Framework Uploads</h3>
                    <p className="text-[11px] text-muted-foreground">4 slots, one company file per framework</p>
                    <p className="text-[11px] text-muted-foreground">Baseline ISO originals are preloaded from backend knowledge base and are not listed in these upload slots.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setShowUploadPanel(prev => !prev)}
                  >
                    {showUploadPanel ? 'Hide' : 'Show'}
                  </Button>
                </div>
                {showUploadPanel && (
                  <div className="space-y-1">
                    {FRAMEWORK_UPLOAD_SLOTS.map((slot) => (
                      <div key={slot.key} className="rounded-lg border border-border/50 bg-slate-50/40 p-1">
                        <div className="flex flex-col gap-1.5 md:flex-row md:items-center md:gap-2">
                          <div className="w-full md:w-32">
                            <p className="text-sm font-medium">{slot.label}</p>
                            <p className="text-[11px] text-muted-foreground">Framework slot</p>
                          </div>
                          <div className="flex-1 min-w-0">
                            {frameworkUploads[slot.key] ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                  Uploaded
                                </span>
                                <p className="text-xs font-medium text-foreground truncate" title={frameworkUploads[slot.key]}>
                                  {frameworkUploads[slot.key]}
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                  Empty
                                </span>
                                <p className="text-xs text-muted-foreground truncate">{slot.helper}</p>
                              </div>
                            )}
                          </div>
                          <input
                            type="file"
                            ref={(el) => { frameworkInputRefs.current[slot.key] = el }}
                            onChange={(e) => handleFrameworkUpload(slot.key, e)}
                            accept=".pdf,.csv,.txt,.md,.docx"
                            className="hidden"
                          />
                          <div className="flex items-center gap-1.5 md:justify-end">
                            {frameworkDocBySlot[slot.key]?.id && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => requestDeleteDocument(frameworkDocBySlot[slot.key]!.id, frameworkDocBySlot[slot.key]!.filename)}
                                disabled={!!uploadingFrameworks[slot.key]}
                                className="h-8 text-red-600 border-red-200 hover:bg-red-50"
                              >
                                <X className="w-3.5 h-3.5 mr-1.5" />
                                Remove
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => frameworkInputRefs.current[slot.key]?.click()}
                              disabled={isLoading || !!uploadingFrameworks[slot.key]}
                              className="h-8 max-w-[13rem]"
                              title={uploadingFrameworkNames[slot.key] || frameworkUploads[slot.key] || 'Upload file'}
                            >
                              <Upload className="w-3.5 h-3.5 mr-1.5" />
                              {!!uploadingFrameworks[slot.key] ? (
                                <span className="inline-block max-w-[9rem] truncate">{uploadingFrameworkNames[slot.key] || 'Uploading...'}</span>
                              ) : frameworkUploads[slot.key] ? (
                                <span className="inline-block max-w-[9rem] truncate">{frameworkUploads[slot.key]}</span>
                              ) : (
                                'Upload'
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="max-w-4xl mx-auto flex gap-3">
                <Input
                  data-assistant-id="chat-input"
                  ref={inputFieldRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder={lastUploadedFile ? `Ask about ${lastUploadedFile}...` : "Ask about ISO 37001/37301/37000/37002 compliance..."}
                  className="flex-1 text-base px-4 py-2 rounded-full border-border/40 focus:ring-2 focus:ring-primary/20"
                  disabled={isLoading || isUploading}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="rounded-full gap-2"
                  onClick={handleCompareQuickAction}
                  disabled={isLoading || isUploading}
                  title="Create compare query"
                >
                  <Shuffle className="w-4 h-4" />
                  <span className="hidden md:inline">Compare</span>
                </Button>
                <Button
                  onClick={handleSendMessage}
                  disabled={isLoading || isUploading || !input.trim()}
                  size="lg"
                  className="rounded-full gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden md:inline">Send</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                Evidence-based ISO compliance guidance using your uploaded company files and baseline ISO documents.
              </p>
            </div>
          </div>
        </ResizablePanel>

        {/* Toggle Right Sidebar Button */}
        <button
          onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-20 bg-white border border-border/40 rounded-l-lg p-2 shadow-lg hover:bg-slate-50 transition-all"
        >
          {isRightSidebarOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {isRightSidebarOpen && (
          <>
            <ResizableHandle withHandle />
            {/* Right Sidebar - Bookmarks & Analytics */}
            <ResizablePanel defaultSize={25} minSize={18} maxSize={40} className="min-w-[240px]">
              <div className="h-full border-l border-border/40 bg-gradient-to-b from-slate-50 to-white flex flex-col overflow-hidden shadow-sm min-h-0">
                <div className="p-4 border-b border-border/40 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-primary" />
                    Saved Responses
                  </h2>
                </div>
                <div className="flex-1 overflow-y-scroll p-4 space-y-4 min-h-0">
                  {/* Document Analytics Chart */}
                  <Card className="p-4 bg-white border border-border/40 overflow-x-hidden shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
                        <BarChart2 className="w-3 h-3 text-primary" />
                        Response Insights
                      </h3>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleExportChart}
                        title="Export chart as PNG"
                        className="h-8 w-8"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                    {chartData.length === 0 ? (
                      <div className="text-xs text-muted-foreground text-center py-6">
                        Ask a question with numbers to generate a chart.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid gap-2">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{getLegendLabel()}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <Select value={chartMode} onValueChange={(value) => setChartMode(value as ChartMode)}>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Mode" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="response">Response</SelectItem>
                                <SelectItem value="sources">Sources</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select
                              value={chartType}
                              onValueChange={(value) => {
                                const nextType = value as ChartType
                                setChartType(nextType)
                                if (activeChartId) {
                                  setChartSnapshots(prev => prev.map(item =>
                                    item.id === activeChartId ? { ...item, type: nextType } : item
                                  ))
                                }
                              }}
                              disabled={chartMode === 'sources'}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bar">Bar</SelectItem>
                                <SelectItem value="line">Line</SelectItem>
                                <SelectItem value="pie">Pie</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {chartSnapshots.length > 0 && (
                            <Select
                              value={activeChartId || chartSnapshots[0]?.id}
                              onValueChange={(value) => setActiveChartId(value)}
                              disabled={chartMode === 'sources'}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Pinned charts" />
                              </SelectTrigger>
                              <SelectContent>
                                {chartSnapshots.map(snapshot => (
                                  <SelectItem key={snapshot.id} value={snapshot.id}>
                                    {snapshot.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div ref={chartContainerRef} className="h-60 rounded-lg bg-gradient-to-b from-slate-50 to-white p-2">
                          <ResponsiveContainer width="100%" height="100%">
                            {chartType === 'line' ? (
                              <LineChart data={chartData} margin={{ top: 10, right: 12, bottom: 8, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickFormatter={shortenLabel} />
                                <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => formatChartValue(value as number, chartUnit)} />
                                <Tooltip
                                  formatter={(value: number) => formatChartValue(value, chartUnit)}
                                  contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                <Line type="monotone" dataKey="value" name={getLegendLabel()} stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                              </LineChart>
                            ) : chartType === 'pie' ? (
                              <PieChart>
                                <Tooltip
                                  formatter={(value: number) => formatChartValue(value, chartUnit)}
                                  contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                <Pie data={chartData} dataKey="value" nameKey="label" innerRadius={40} outerRadius={70} paddingAngle={4}>
                                  {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9"][index % 6]} />
                                  ))}
                                </Pie>
                              </PieChart>
                            ) : (
                              <BarChart data={chartData} margin={{ top: 10, right: 12, bottom: 8, left: 0 }}>
                                <defs>
                                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.9} />
                                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.7} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickFormatter={shortenLabel} />
                                <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => formatChartValue(value as number, chartUnit)} />
                                <Tooltip
                                  formatter={(value: number) => formatChartValue(value, chartUnit)}
                                  contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
                                />
                                <Legend wrapperStyle={{ fontSize: 10 }} />
                                <Bar dataKey="value" name={getLegendLabel()} fill="url(#chartGradient)" radius={[6, 6, 0, 0]} barSize={24}>
                                  {chartData.map((entry, index) => (
                                    <Cell key={`bar-cell-${index}`} fill={["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9"][index % 6]} />
                                  ))}
                                </Bar>
                              </BarChart>
                            )}
                          </ResponsiveContainer>
                        </div>

                        <div className="border border-border/40 rounded-lg overflow-hidden">
                          <div className="grid grid-cols-2 bg-slate-50 text-[11px] font-semibold text-muted-foreground px-3 py-2">
                            <span>Label</span>
                            <span className="text-right">Value</span>
                          </div>
                          <div className="max-h-32 overflow-y-auto">
                            {chartData.map((item, index) => (
                              <div key={`${item.label}-${index}`} className="grid grid-cols-2 px-3 py-2 text-xs border-t border-border/30">
                                <span className="text-foreground truncate" title={item.label}>{item.label}</span>
                                <span className="text-right text-foreground">
                                  {formatChartValue(item.value, chartUnit)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-3 text-center">
                      Auto-generated from the latest response
                    </p>
                  </Card>

                  {/* Saved Bookmarks */}
                  {bookmarks.length === 0 ? (
                    <div className="text-center py-8">
                      <Bookmark className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">
                        Bookmark AI responses to save them here for quick reference
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-foreground">Bookmarked Responses</h3>
                      {messages
                        .filter(m => bookmarks.includes(m.id))
                        .map(message => (
                          <Card key={message.id} className="p-3 bg-white border border-border/40 hover:shadow-md transition-shadow cursor-pointer">
                            <p className="line-clamp-4 text-xs text-muted-foreground leading-relaxed">
                              {message.content}
                            </p>
                          </Card>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* Deletion confirmation dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteConfirm?.type === 'session' ? 'Delete Chat' : 'Delete Document'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === 'session'
                ? `Are you sure you want to delete "${deleteConfirm.label}"? This action cannot be undone.`
                : `Delete "${deleteConfirm?.label}"? This will remove the file and its indexed data.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (!deleteConfirm) return
                if (deleteConfirm.type === 'session') {
                  handleDeleteSession(deleteConfirm.id)
                } else {
                  const doc = uploadedDocuments.find(d => d.id === deleteConfirm.id)
                  handleDeleteDocument(deleteConfirm.id, doc?.filename || deleteConfirm.label)
                }
                setDeleteConfirm(null)
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
