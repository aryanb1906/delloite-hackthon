'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Save, LogOut, Trash2, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { Logo } from '@/components/logo'
import { UserMenu } from '@/components/user-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useAssistantContext } from '@/components/voice-assistant/assistant-context-provider'

export default function SettingsPage() {
    const router = useRouter()
    const { user, logout } = useAuth()
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [successMessage, setSuccessMessage] = useState('')

    const [settings, setSettings] = useState({
        email: '',
        username: '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    })

    const assistantCtx = useAssistantContext();
    useEffect(() => { assistantCtx.setCurrentPage("settings"); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    useEffect(() => {
        if (!user) {
            router.push('/login')
            return
        }

        setSettings(prev => ({
            ...prev,
            email: user.email || '',
            username: user.name || '',
        }))
    }, [user, router])

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!settings.currentPassword || !settings.newPassword || !settings.confirmPassword) {
            alert('All password fields are required')
            return
        }

        if (settings.newPassword !== settings.confirmPassword) {
            alert('New passwords do not match')
            return
        }

        if (settings.newPassword.length < 6) {
            alert('Password must be at least 6 characters')
            return
        }

        try {
            setIsSaving(true)
            // Call backend to change password
            const response = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentPassword: settings.currentPassword,
                    newPassword: settings.newPassword,
                }),
            })

            if (!response.ok) {
                const data = await response.json()
                alert(data.error || 'Failed to change password')
                return
            }

            setSuccessMessage('Password changed successfully!')
            setSettings(prev => ({
                ...prev,
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
            }))

            setTimeout(() => setSuccessMessage(''), 3000)
        } catch (error) {
            console.error('Password change error:', error)
            alert('Failed to change password. Please try again.')
        } finally {
            setIsSaving(false)
        }
    }

    const handleLogout = async () => {
        await logout()
        router.push('/login')
    }

    const handleDeleteAccount = async () => {
        try {
            setIsLoading(true)
            const response = await fetch('/api/auth/delete-account', {
                method: 'DELETE',
            })

            if (!response.ok) {
                alert('Failed to delete account')
                return
            }

            await logout()
            router.push('/')
        } catch (error) {
            console.error('Delete account error:', error)
            alert('Failed to delete account. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    if (!user) {
        return null
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Navigation */}
            <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-border/40">
                <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
                    <Link href="/chat" className="flex items-center gap-2 hover:opacity-70 transition-opacity">
                        <ArrowLeft className="w-4 h-4" />
                        <span className="text-sm font-medium">Back to Chat</span>
                    </Link>
                    <Logo size="sm" showText={true} href="/" />
                    <UserMenu />
                </div>
            </nav>

            {/* Main Content */}
            <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
                <div data-assistant-id="settings-section" className="space-y-6">
                    {/* Header */}
                    <div>
                        <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
                        <p className="text-muted-foreground">Manage your account settings and preferences</p>
                    </div>

                    {successMessage && (
                        <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
                            {successMessage}
                        </div>
                    )}

                    {/* Account Information */}
                    <Card className="p-6">
                        <h2 className="text-lg font-semibold text-foreground mb-4">Account Information</h2>
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="email">Email Address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={settings.email}
                                    disabled
                                    className="mt-2 bg-muted"
                                />
                                <p className="text-xs text-muted-foreground mt-2">Email cannot be changed</p>
                            </div>

                            <div>
                                <Label htmlFor="username">Username</Label>
                                <Input
                                    id="username"
                                    type="text"
                                    value={settings.username}
                                    disabled
                                    className="mt-2 bg-muted"
                                />
                                <p className="text-xs text-muted-foreground mt-2">Username is managed by your auth provider</p>
                            </div>
                        </div>
                    </Card>

                    {/* Change Password */}
                    <Card className="p-6">
                        <h2 className="text-lg font-semibold text-foreground mb-4">Change Password</h2>
                        <form onSubmit={handleChangePassword} className="space-y-4">
                            <div>
                                <Label htmlFor="currentPassword">Current Password</Label>
                                <div className="relative mt-2">
                                    <Input
                                        id="currentPassword"
                                        type={showPassword ? 'text' : 'password'}
                                        value={settings.currentPassword}
                                        onChange={(e) => setSettings(prev => ({ ...prev, currentPassword: e.target.value }))}
                                        placeholder="Enter current password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="newPassword">New Password</Label>
                                <Input
                                    id="newPassword"
                                    type={showPassword ? 'text' : 'password'}
                                    value={settings.newPassword}
                                    onChange={(e) => setSettings(prev => ({ ...prev, newPassword: e.target.value }))}
                                    placeholder="Enter new password (min. 6 characters)"
                                    className="mt-2"
                                />
                            </div>

                            <div>
                                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                                <Input
                                    id="confirmPassword"
                                    type={showPassword ? 'text' : 'password'}
                                    value={settings.confirmPassword}
                                    onChange={(e) => setSettings(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                    placeholder="Confirm new password"
                                    className="mt-2"
                                />
                            </div>

                            <Button
                                type="submit"
                                disabled={isSaving || !settings.currentPassword || !settings.newPassword || !settings.confirmPassword}
                                className="w-full gap-2"
                            >
                                <Save className="w-4 h-4" />
                                {isSaving ? 'Saving...' : 'Save New Password'}
                            </Button>
                        </form>
                    </Card>

                    {/* Dangerous Zone */}
                    <Card className="p-6 border-destructive/30 bg-destructive/5">
                        <h2 className="text-lg font-semibold text-destructive mb-4">Danger Zone</h2>
                        <div className="space-y-4">
                            {/* Logout */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-medium text-foreground">Logout</h3>
                                    <p className="text-sm text-muted-foreground">Sign out from this device</p>
                                </div>
                                <Button
                                    variant="outline"
                                    className="gap-2 border-destructive text-destructive hover:bg-destructive/10"
                                    onClick={handleLogout}
                                >
                                    <LogOut className="w-4 h-4" />
                                    Logout
                                </Button>
                            </div>

                            {/* Delete Account */}
                            <div className="border-t border-destructive/20 pt-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="font-medium text-destructive">Delete Account</h3>
                                        <p className="text-sm text-muted-foreground">
                                            Permanently delete your account and all associated data
                                        </p>
                                    </div>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                variant="destructive"
                                                disabled={isLoading}
                                                className="gap-2"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Delete Account
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Delete Account</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    Are you sure you want to delete your account? This action cannot be undone.
                                                    All your data, chat history, and settings will be permanently deleted.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={handleDeleteAccount}
                                                    className="bg-destructive hover:bg-destructive/90"
                                                >
                                                    Delete Account
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    )
}
