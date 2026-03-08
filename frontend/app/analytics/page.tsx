'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, TrendingUp, MessageSquare, Upload, Zap, Clock, Activity } from 'lucide-react'
import { getAnalyticsSummary, getQueryDistribution } from '@/lib/api'
import { UserMenu } from '@/components/user-menu'
import { useRegisterAssistantData } from '@/components/voice-assistant/use-register-assistant-data'
import { useAssistantContext } from '@/components/voice-assistant/assistant-context-provider'
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts'

interface AnalyticsSummary {
    totalQueries: number
    totalUploads: number
    activeUsers: number
    totalTaxSaved: number
    avgResponseTime: number
    cacheHitRate: number
    topEvents: { type: string; count: number }[]
    period?: string
}

export default function AnalyticsPage() {
    const router = useRouter()
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
    const [queryData, setQueryData] = useState<{ date: string; count: number }[]>([])
    const [days, setDays] = useState(30)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const loadAnalytics = async () => {
            try {
                // Check if user is logged in
                const userId = localStorage.getItem('userId')
                if (!userId) {
                    router.push('/login')
                    return
                }

                setIsLoading(true)

                // Load analytics data
                const summaryData = await getAnalyticsSummary(days)
                setSummary(summaryData)

                const distributionData = await getQueryDistribution(days)
                setQueryData(distributionData)
            } catch (error) {
                console.error('Failed to load analytics:', error)
            } finally {
                setIsLoading(false)
            }
        }

        loadAnalytics()
    }, [days, router])

    // ── Register data with assistant context ──
    const assistantVisuals = useMemo(() => {
        const v = [];
        if (queryData.length > 0) {
            v.push({ id: "analytics-query-dist", type: "line" as const, title: "Query Distribution Over Time", data: queryData, description: `Query count per day over last ${days} days` });
        }
        if (summary?.topEvents?.length) {
            v.push({ id: "analytics-top-events", type: "bar" as const, title: "Top Events", data: summary.topEvents, description: "Most frequent event types" });
        }
        return v;
    }, [queryData, summary, days]);

    const assistantSummaries = useMemo(() => {
        if (!summary) return [];
        return [
            { id: "analytics-total-queries", label: "Total Queries", value: summary.totalQueries ?? 0 },
            { id: "analytics-total-uploads", label: "Documents Uploaded", value: summary.totalUploads ?? 0 },
            { id: "analytics-avg-response", label: "Avg Response Time", value: summary.avgResponseTime ? `${summary.avgResponseTime.toFixed(2)}s` : "N/A" },
            { id: "analytics-cache-rate", label: "Cache Hit Rate", value: summary.cacheHitRate ? `${(summary.cacheHitRate * 100).toFixed(1)}%` : "0%" },
        ];
    }, [summary]);

    const assistantCtx = useAssistantContext();
    useEffect(() => { assistantCtx.setCurrentPage("analytics"); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    useRegisterAssistantData({ page: "analytics", visuals: assistantVisuals, summaries: assistantSummaries, metadata: { days } });

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
                <div className="text-center">
                    <Activity className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading analytics...</p>
                </div>
            </div>
        )
    }

    const summaryCards = [
        {
            title: 'Total Queries',
            value: `${summary?.totalQueries || 0}`,
            subtitle: summary?.period || `Last ${days} days`,
            insight: `${summary?.totalQueries || 0} questions were asked in this time window.`,
            icon: <MessageSquare className="w-5 h-5 text-primary" />
        },
        {
            title: 'Documents Uploaded',
            value: `${summary?.totalUploads || 0}`,
            subtitle: summary?.period || `Last ${days} days`,
            insight: `${summary?.totalUploads || 0} files were added for analysis.`,
            icon: <Upload className="w-5 h-5 text-blue-600" />
        },
        {
            title: 'Avg Response Time',
            value: summary?.avgResponseTime ? `${summary.avgResponseTime.toFixed(2)}s` : 'N/A',
            subtitle: 'Average across all queries',
            insight: summary?.avgResponseTime
                ? `Typical reply time is ${summary.avgResponseTime.toFixed(2)} seconds.`
                : 'No response timing data available yet.',
            icon: <Clock className="w-5 h-5 text-green-600" />
        },
        {
            title: 'Cache Hit Rate',
            value: summary?.cacheHitRate ? `${(summary.cacheHitRate * 100).toFixed(1)}%` : '0%',
            subtitle: 'Faster responses from cache',
            insight: summary?.cacheHitRate
                ? `${(summary.cacheHitRate * 100).toFixed(1)}% of requests were served from cache.`
                : 'Cache has not served any requests yet.',
            icon: <Zap className="w-5 h-5 text-yellow-600" />
        }
    ]

    return (
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
            <div className="pointer-events-none absolute -top-28 -left-20 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 -right-20 h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl" />
            {/* Header */}
            <div className="border-b border-white/60 bg-white/75 backdrop-blur-md sticky top-0 z-10 shadow-sm">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link href="/chat">
                                <Button variant="ghost" size="icon" className="transition-transform duration-200 hover:scale-105 active:scale-95">
                                    <ArrowLeft className="w-5 h-5" />
                                </Button>
                            </Link>
                            <div>
                                <h1 className="text-2xl font-bold text-foreground">Analytics Dashboard</h1>
                                <p className="text-sm text-muted-foreground">
                                    View your chat statistics and insights
                                </p>
                            </div>
                        </div>
                        <UserMenu />
                    </div>
                </div>
            </div>

            {/* Content */}
            <div data-assistant-id="analytics-charts" className="relative container mx-auto px-4 py-8">
                {/* Time Period Filter */}
                <div className="mb-6 inline-flex gap-2 rounded-full border border-white/70 bg-white/70 p-1.5 shadow-sm backdrop-blur-sm">
                    <Button
                        variant={days === 7 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setDays(7)}
                        className="rounded-full transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
                    >
                        Last 7 Days
                    </Button>
                    <Button
                        variant={days === 30 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setDays(30)}
                        className="rounded-full transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
                    >
                        Last 30 Days
                    </Button>
                    <Button
                        variant={days === 90 ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setDays(90)}
                        className="rounded-full transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
                    >
                        Last 90 Days
                    </Button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {summaryCards.map((card) => (
                        <Card
                            key={card.title}
                            tabIndex={0}
                            className="p-6 relative group overflow-hidden border border-white/70 bg-white/75 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        >
                            <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-slate-300/70 to-transparent transition-all duration-300 group-hover:via-blue-400/70 group-focus-within:via-blue-400/70" />
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-medium text-muted-foreground">{card.title}</h3>
                                {card.icon}
                            </div>
                            <p className="text-3xl font-bold text-foreground">{card.value}</p>
                            <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                            <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-md bg-slate-900/95 px-3 py-2 text-[11px] leading-snug text-white opacity-0 translate-y-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0">
                                {card.insight}
                            </div>
                        </Card>
                    ))}
                </div>

                {/* Query Distribution Chart */}
                <Card className="p-6 mb-8 border border-white/70 bg-white/80 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5" />
                        Query Distribution Over Time
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={queryData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="date"
                                fontSize={12}
                                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            />
                            <YAxis fontSize={12} />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: '12px',
                                    border: '1px solid rgba(148, 163, 184, 0.25)',
                                    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
                                    backdropFilter: 'blur(6px)'
                                }}
                                labelFormatter={(value) => new Date(value).toLocaleDateString('en-US', {
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric'
                                })}
                            />
                            <Legend />
                            <Line
                                type="monotone"
                                dataKey="count"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                name="Queries"
                                dot={{ fill: '#3b82f6' }}
                                activeDot={{ r: 6, fill: '#1d4ed8', stroke: '#dbeafe', strokeWidth: 2 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </Card>
                {/* Top Events */}
                {summary?.topEvents && summary.topEvents.length > 0 && (
                    <Card className="p-6 border border-white/70 bg-white/80 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-lg">
                        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                            <Activity className="w-5 h-5" />
                            Top Events
                        </h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={summary.topEvents}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="type" fontSize={12} />
                                <YAxis fontSize={12} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="count" fill="#10b981" name="Count" />
                            </BarChart>
                        </ResponsiveContainer>
                    </Card>
                )}

                {/* Empty State */}
                {!summary?.totalQueries && (
                    <Card className="p-12 text-center">
                        <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                        <h3 className="text-lg font-semibold text-foreground mb-2">No data yet</h3>
                        <p className="text-muted-foreground mb-6">
                            Start chatting to see your analytics data here
                        </p>
                        <Link href="/chat">
                            <Button>
                                Go to Chat
                            </Button>
                        </Link>
                    </Card>
                )}
            </div>
        </div>
    )
}
