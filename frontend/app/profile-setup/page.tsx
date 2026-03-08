'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/components/auth-provider'
import { updateProfile as updateUserProfile, getProfile } from '@/lib/api'
import { Logo } from '@/components/logo'
import { useAssistantContext } from '@/components/voice-assistant/assistant-context-provider'

interface UserProfile {
    age: number | ''
    gender: string
    income: string
    employmentStatus: string
    taxRegime: string
    homeownerStatus: string
    children?: string
    childrenAges?: string
    parentsAge?: string
    investmentCapacity?: string
    riskAppetite?: string
    financialGoals?: string[]
    existingInvestments?: string[]
    isProfileComplete?: boolean
}

const DEFAULT_PROFILE: UserProfile = {
    age: '',
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
    financialGoals: [],
    existingInvestments: [],
    isProfileComplete: false,
}

export default function ProfileSetupPage() {
    const router = useRouter()
    const { user } = useAuth()
    const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE)
    const [isSaving, setIsSaving] = useState(false)
    const [completedFields, setCompletedFields] = useState<string[]>([])
    const initializationDone = useRef(false)
    const assistantCtx = useAssistantContext();
    useEffect(() => { assistantCtx.setCurrentPage("profile-setup"); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    useEffect(() => {
        if (initializationDone.current) return
        initializationDone.current = true

        // Check for OAuth success redirect - just parse and store data
        const urlParams = new URLSearchParams(window.location.search)
        const oauthSuccess = urlParams.get('oauth_success')
        const userData = urlParams.get('user_data')

        if (oauthSuccess === 'true' && userData) {
            try {
                const user = JSON.parse(userData)
                localStorage.setItem('userId', user.id)
                localStorage.setItem('userEmail', user.email)
                localStorage.setItem('userName', user.username)
                localStorage.removeItem('userProfile') // Clear old profile data
                window.history.replaceState({}, '', '/profile-setup')
            } catch (error) {
                console.error('Failed to parse OAuth user data:', error)
            }
        }

        // Load saved profile from localStorage if exists (for partial profiles)
        const savedProfile = localStorage.getItem('userProfile')
        if (savedProfile) {
            try {
                const parsed = JSON.parse(savedProfile) as Partial<UserProfile>
                const mergedProfile: UserProfile = { ...DEFAULT_PROFILE, ...parsed }
                setProfile(mergedProfile)

                const requiredFields = ['age', 'gender', 'income', 'employmentStatus', 'taxRegime', 'homeownerStatus']
                const completed = requiredFields.filter(field => {
                    const value = mergedProfile[field as keyof UserProfile]
                    return value && value !== ''
                })
                setCompletedFields(completed)
            } catch (error) {
                console.error('Failed to parse saved profile:', error)
            }
        }

        // If userId is missing but auth cookie exists, restore user data from session
        const ensureUserFromSession = async () => {
            const existingUserId = localStorage.getItem('userId')
            if (existingUserId) return

            try {
                const res = await fetch('/api/auth/me')
                const data = await res.json()
                if (data?.user?.id) {
                    localStorage.setItem('userId', data.user.id)
                    localStorage.setItem('userEmail', data.user.email || '')
                    localStorage.setItem('userName', data.user.name || '')
                }
            } catch (error) {
                console.error('Failed to restore user from session:', error)
            }
        }

        void ensureUserFromSession()
    }, [])

    const handleSaveProfile = async () => {
        // Validate required fields
        const requiredFields = ['age', 'gender', 'income', 'employmentStatus', 'taxRegime', 'homeownerStatus']
        const allFieldsFilled = requiredFields.every(field => {
            const value = profile[field as keyof UserProfile]
            return value && value !== ''
        })

        if (!allFieldsFilled) {
            alert('Please fill all required fields (marked with *)')
            return
        }

        setIsSaving(true)

        try {
            // Get userId from localStorage
            let userId = localStorage.getItem('userId')

            // Fallback: restore userId from cookie-based auth session
            if (!userId) {
                try {
                    const res = await fetch('/api/auth/me')
                    const data = await res.json()
                    if (data?.user?.id) {
                        userId = data.user.id
                        localStorage.setItem('userId', data.user.id)
                        localStorage.setItem('userEmail', data.user.email || '')
                        localStorage.setItem('userName', data.user.name || '')
                    }
                } catch (error) {
                    console.error('Failed to restore user from session during save:', error)
                }
            }

            if (!userId) {
                alert('User not found. Please login again.')
                router.push('/login')
                return
            }

            // Convert age to number
            const profileData = {
                ...profile,
                age: typeof profile.age === 'string' ? parseInt(profile.age) : profile.age,
            }

            // Update profile in database
            await updateUserProfile(userId, profileData)

            // Update local storage for backward compatibility
            const profileToSave = {
                ...profileData,
                isProfileComplete: true,
            }
            localStorage.setItem('userProfile', JSON.stringify(profileToSave))

            // Redirect to chat
            setTimeout(() => {
                router.push('/chat')
            }, 500)
        } catch (error) {
            console.error('Failed to save profile:', error)
            alert('Failed to save profile. Please try again.')
        } finally {
            setIsSaving(false)
        }
    }

    const updateProfile = (field: keyof UserProfile, value: any) => {
        setProfile(prev => ({
            ...prev,
            [field]: value,
        }))

        // Update completed fields
        const requiredFields = ['age', 'gender', 'income', 'employmentStatus', 'taxRegime', 'homeownerStatus']
        if (requiredFields.includes(field)) {
            if (value && value !== '') {
                setCompletedFields(prev => [...new Set([...prev, field])])
            } else {
                setCompletedFields(prev => prev.filter(f => f !== field))
            }
        }
    }

    const requiredFields = ['age', 'gender', 'income', 'employmentStatus', 'taxRegime', 'homeownerStatus']
    const progressPercent = (completedFields.length / requiredFields.length) * 100

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <Link href="/" className="flex items-center gap-2 text-sm font-medium text-primary hover:opacity-70 transition-opacity mb-4">
                        <ArrowLeft className="w-4 h-4" />
                        Back to Home
                    </Link>
                    <div className="mb-4">
                        <Logo size="lg" showText={true} showTagline={true} href={null} />
                    </div>
                    <h1 className="text-4xl font-bold text-foreground mb-2">Welcome to Arth-Mitra! 👋</h1>
                    <p className="text-muted-foreground text-lg">
                        {user?.name ? `Hi ${user.name},` : 'Hi there,'} let's set up your financial profile for personalized guidance
                    </p>
                </div>

                {/* Progress Bar */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-semibold text-foreground">Profile Setup Progress</h2>
                        <span className="text-sm font-medium text-primary">{completedFields.length}/{requiredFields.length}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                        <div
                            className="bg-gradient-to-r from-primary to-blue-600 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>

                {/* Main Form Card */}
                <Card data-assistant-id="profile-section" className="p-8 bg-white shadow-lg border-border/40 mb-6">
                    <div className="space-y-8">
                        {/* Required Fields Section */}
                        <div>
                            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-6">
                                <span className="text-red-500">*</span> Basic Information (Required)
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Age */}
                                <div className="grid gap-2">
                                    <Label htmlFor="age" className="text-sm font-medium">
                                        <span className="text-red-500">*</span> Age
                                    </Label>
                                    <Input
                                        id="age"
                                        type="number"
                                        min="18"
                                        max="100"
                                        value={profile.age}
                                        onChange={(e) => updateProfile('age', parseInt(e.target.value) || '')}
                                        className="border-border/40 focus:ring-2 focus:ring-primary/20"
                                        placeholder="Enter your age"
                                    />
                                </div>

                                {/* Gender */}
                                <div className="grid gap-2">
                                    <Label htmlFor="gender" className="text-sm font-medium">
                                        <span className="text-red-500">*</span> Gender
                                    </Label>
                                    <Select value={profile.gender} onValueChange={(value) => updateProfile('gender', value)}>
                                        <SelectTrigger className="border-border/40 focus:ring-2 focus:ring-primary/20">
                                            <SelectValue placeholder="Select gender" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Male">Male</SelectItem>
                                            <SelectItem value="Female">Female</SelectItem>
                                            <SelectItem value="Other">Other</SelectItem>
                                            <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Income */}
                                <div className="grid gap-2">
                                    <Label htmlFor="income" className="text-sm font-medium">
                                        <span className="text-red-500">*</span> Annual Income
                                    </Label>
                                    <Input
                                        id="income"
                                        value={profile.income}
                                        onChange={(e) => updateProfile('income', e.target.value)}
                                        className="border-border/40 focus:ring-2 focus:ring-primary/20"
                                        placeholder="e.g., ₹15 LPA"
                                    />
                                </div>

                                {/* Employment Status */}
                                <div className="grid gap-2">
                                    <Label htmlFor="employmentStatus" className="text-sm font-medium">
                                        <span className="text-red-500">*</span> Employment Status
                                    </Label>
                                    <Select value={profile.employmentStatus} onValueChange={(value) => updateProfile('employmentStatus', value)}>
                                        <SelectTrigger className="border-border/40 focus:ring-2 focus:ring-primary/20">
                                            <SelectValue placeholder="Select status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Salaried - Government">Salaried - Government</SelectItem>
                                            <SelectItem value="Salaried - Private">Salaried - Private</SelectItem>
                                            <SelectItem value="Self-Employed">Self-Employed</SelectItem>
                                            <SelectItem value="Business Owner">Business Owner</SelectItem>
                                            <SelectItem value="Retired">Retired</SelectItem>
                                            <SelectItem value="Unemployed">Unemployed</SelectItem>
                                            <SelectItem value="Student">Student</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Tax Regime */}
                                <div className="grid gap-2">
                                    <Label htmlFor="taxRegime" className="text-sm font-medium">
                                        <span className="text-red-500">*</span> Tax Regime
                                    </Label>
                                    <Select value={profile.taxRegime} onValueChange={(value) => updateProfile('taxRegime', value)}>
                                        <SelectTrigger className="border-border/40 focus:ring-2 focus:ring-primary/20">
                                            <SelectValue placeholder="Select tax regime" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Old Regime">Old Regime (with deductions)</SelectItem>
                                            <SelectItem value="New Regime">New Regime (lower rates)</SelectItem>
                                            <SelectItem value="Not Sure">Not Sure / Need Help</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Housing Status */}
                                <div className="grid gap-2">
                                    <Label htmlFor="homeownerStatus" className="text-sm font-medium">
                                        <span className="text-red-500">*</span> Housing Status
                                    </Label>
                                    <Select value={profile.homeownerStatus} onValueChange={(value) => updateProfile('homeownerStatus', value)}>
                                        <SelectTrigger className="border-border/40 focus:ring-2 focus:ring-primary/20">
                                            <SelectValue placeholder="Select housing status" />
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
                        </div>

                        {/* Optional Fields Section */}
                        <div className="border-t border-border/40 pt-8">
                            <h3 className="text-lg font-semibold text-foreground mb-6">
                                Additional Information (Optional - for better recommendations)
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Children */}
                                <div className="grid gap-2">
                                    <Label htmlFor="children">Number of Children</Label>
                                    <Input
                                        id="children"
                                        type="number"
                                        min="0"
                                        value={profile.children}
                                        onChange={(e) => updateProfile('children', e.target.value)}
                                        className="border-border/40 focus:ring-2 focus:ring-primary/20"
                                        placeholder="0"
                                    />
                                </div>

                                {/* Children Ages */}
                                <div className="grid gap-2">
                                    <Label htmlFor="childrenAges">Children Ages</Label>
                                    <Input
                                        id="childrenAges"
                                        value={profile.childrenAges}
                                        onChange={(e) => updateProfile('childrenAges', e.target.value)}
                                        className="border-border/40 focus:ring-2 focus:ring-primary/20"
                                        placeholder="e.g., 5, 8, 12"
                                    />
                                </div>

                                {/* Parents Age */}
                                <div className="grid gap-2">
                                    <Label htmlFor="parentsAge">Parents Age</Label>
                                    <Input
                                        id="parentsAge"
                                        value={profile.parentsAge}
                                        onChange={(e) => updateProfile('parentsAge', e.target.value)}
                                        className="border-border/40 focus:ring-2 focus:ring-primary/20"
                                        placeholder="e.g., Father 65, Mother 62"
                                    />
                                </div>

                                {/* Investment Capacity */}
                                <div className="grid gap-2">
                                    <Label htmlFor="investmentCapacity">Annual Investment Capacity</Label>
                                    <Select value={profile.investmentCapacity} onValueChange={(value) => updateProfile('investmentCapacity', value)}>
                                        <SelectTrigger className="border-border/40 focus:ring-2 focus:ring-primary/20">
                                            <SelectValue placeholder="Select capacity" />
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

                                {/* Risk Appetite */}
                                <div className="grid gap-2">
                                    <Label htmlFor="riskAppetite">Risk Appetite</Label>
                                    <Select value={profile.riskAppetite} onValueChange={(value) => updateProfile('riskAppetite', value)}>
                                        <SelectTrigger className="border-border/40 focus:ring-2 focus:ring-primary/20">
                                            <SelectValue placeholder="Select risk level" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Conservative">Conservative (Fixed returns only)</SelectItem>
                                            <SelectItem value="Moderate">Moderate (Mix of fixed & growth)</SelectItem>
                                            <SelectItem value="Aggressive">Aggressive (Growth focused)</SelectItem>
                                            <SelectItem value="Not Sure">Not Sure / Need Guidance</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Save Button */}
                <div className="flex gap-4">
                    <Link href="/" className="flex-1">
                        <Button variant="outline" className="w-full border-border/40">
                            Cancel
                        </Button>
                    </Link>
                    <Button
                        onClick={handleSaveProfile}
                        disabled={isSaving || completedFields.length < requiredFields.length}
                        className="flex-1 gap-2"
                        size="lg"
                    >
                        {isSaving ? (
                            <>Saving...</>
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                Continue to Chat
                            </>
                        )}
                    </Button>
                </div>

                {/* Info Box */}
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-900">
                        <p className="font-semibold mb-1">Why we need this information:</p>
                        <p>Your profile helps our AI provide personalized financial guidance tailored to your situation. The more details you provide, the better recommendations you'll receive!</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
