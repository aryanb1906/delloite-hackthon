'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowLeft, Calculator, TrendingDown, Info } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRegisterAssistantData } from '@/components/voice-assistant/use-register-assistant-data'
import { useAssistantContext } from '@/components/voice-assistant/assistant-context-provider'
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    ComposedChart,
} from 'recharts'

interface TaxResult {
    oldRegime: {
        taxableIncome: number
        tax: number
        cess: number
        totalTax: number
        netIncome: number
        effectiveRate: number
        marginalRate: number
        deductionUtilization: number
        takeHomePercentage: number
    }
    newRegime: {
        taxableIncome: number
        tax: number
        cess: number
        totalTax: number
        netIncome: number
        effectiveRate: number
        marginalRate: number
        deductionUtilization: number
        takeHomePercentage: number
    }
    savings: {
        amount: number
        percentage: number
    }
}

export default function TaxCalculatorPage() {
    const router = useRouter()
    const [grossIncome, setGrossIncome] = useState('')
    const [standardDeduction, setStandardDeduction] = useState('50000')
    const [section80C, setSection80C] = useState('')
    const [section80D, setSection80D] = useState('')
    const [section80E, setSection80E] = useState('')
    const [section80TTA, setSection80TTA] = useState('')
    const [HRA, setHRA] = useState('')
    const [otherDeductions, setOtherDeductions] = useState('')
    const [taxResult, setTaxResult] = useState<TaxResult | null>(null)
    const [ageGroup, setAgeGroup] = useState<'below60' | 'senior' | 'supersenior'>('below60')

    const getTaxSlabs = (regime: 'old' | 'new', ageGroup: string) => {
        if (regime === 'old') {
            if (ageGroup === 'senior') {
                return [
                    { limit: 300000, rate: 0 },
                    { limit: 500000, rate: 5 },
                    { limit: 1000000, rate: 20 },
                    { limit: Infinity, rate: 30 },
                ]
            } else if (ageGroup === 'supersenior') {
                return [
                    { limit: 500000, rate: 0 },
                    { limit: 1000000, rate: 20 },
                    { limit: Infinity, rate: 30 },
                ]
            } else {
                return [
                    { limit: 250000, rate: 0 },
                    { limit: 500000, rate: 5 },
                    { limit: 1000000, rate: 20 },
                    { limit: Infinity, rate: 30 },
                ]
            }
        } else {
            if (ageGroup === 'senior') {
                return [
                    { limit: 300000, rate: 0 },
                    { limit: 500000, rate: 5 },
                    { limit: 1000000, rate: 20 },
                    { limit: 1500000, rate: 30 },
                    { limit: Infinity, rate: 37 },
                ]
            } else if (ageGroup === 'supersenior') {
                return [
                    { limit: 500000, rate: 0 },
                    { limit: 1000000, rate: 20 },
                    { limit: 1500000, rate: 30 },
                    { limit: Infinity, rate: 37 },
                ]
            } else {
                return [
                    { limit: 300000, rate: 0 },
                    { limit: 600000, rate: 5 },
                    { limit: 900000, rate: 10 },
                    { limit: 1200000, rate: 15 },
                    { limit: 1500000, rate: 20 },
                    { limit: 1800000, rate: 25 },
                    { limit: Infinity, rate: 30 },
                ]
            }
        }
    }

    const calculateTax = (taxableIncome: number, slabs: any[]) => {
        let tax = 0
        let previousLimit = 0

        for (const slab of slabs) {
            if (taxableIncome > previousLimit) {
                const incomeInSlab = Math.min(taxableIncome, slab.limit) - previousLimit
                tax += (incomeInSlab * slab.rate) / 100
                previousLimit = slab.limit
            }
        }

        return tax
    }

    const getMarginalRate = (taxableIncome: number, slabs: any[]): number => {
        for (const slab of slabs) {
            if (taxableIncome <= slab.limit) {
                return slab.rate
            }
        }
        return slabs[slabs.length - 1].rate
    }

    const handleCalculate = () => {
        if (!grossIncome) {
            alert('Please enter gross income')
            return
        }

        const gross = parseFloat(grossIncome)
        const std = parseFloat(standardDeduction || '0')
        const sec80c = parseFloat(section80C || '0')
        const sec80d = parseFloat(section80D || '0')
        const sec80e = parseFloat(section80E || '0')
        const sec80tta = parseFloat(section80TTA || '0')
        const hra = parseFloat(HRA || '0')
        const other = parseFloat(otherDeductions || '0')

        // Old Regime Calculation
        const totalDeductionsOld = std + sec80c + sec80d + sec80e + sec80tta + hra + other
        const taxableIncomeOld = Math.max(0, gross - totalDeductionsOld)
        const taxOld = calculateTax(taxableIncomeOld, getTaxSlabs('old', ageGroup))
        const cessOld = (taxOld * 4) / 100 // 4% cess
        const totalTaxOld = taxOld + cessOld
        const netIncomeOld = gross - totalTaxOld
        const effectiveRateOld = (totalTaxOld / gross) * 100
        const marginalRateOld = getMarginalRate(taxableIncomeOld, getTaxSlabs('old', ageGroup))
        const deductionUtilizationOld = (totalDeductionsOld / gross) * 100
        const takeHomePercentageOld = (netIncomeOld / gross) * 100

        // New Regime Calculation
        const totalDeductionsNew = std // Only standard deduction in new regime
        const taxableIncomeNew = Math.max(0, gross - totalDeductionsNew)
        const taxNew = calculateTax(taxableIncomeNew, getTaxSlabs('new', ageGroup))
        const cessNew = (taxNew * 4) / 100 // 4% cess
        const totalTaxNew = taxNew + cessNew
        const netIncomeNew = gross - totalTaxNew
        const effectiveRateNew = (totalTaxNew / gross) * 100
        const marginalRateNew = getMarginalRate(taxableIncomeNew, getTaxSlabs('new', ageGroup))
        const deductionUtilizationNew = (totalDeductionsNew / gross) * 100
        const takeHomePercentageNew = (netIncomeNew / gross) * 100

        // Savings calculation
        const savings = totalTaxOld - totalTaxNew
        const savingsPercentage = totalTaxOld > 0 ? (savings / totalTaxOld) * 100 : 0

        setTaxResult({
            oldRegime: {
                taxableIncome: taxableIncomeOld,
                tax: taxOld,
                cess: cessOld,
                totalTax: totalTaxOld,
                netIncome: netIncomeOld,
                effectiveRate: effectiveRateOld,
                marginalRate: marginalRateOld,
                deductionUtilization: deductionUtilizationOld,
                takeHomePercentage: takeHomePercentageOld,
            },
            newRegime: {
                taxableIncome: taxableIncomeNew,
                tax: taxNew,
                cess: cessNew,
                totalTax: totalTaxNew,
                netIncome: netIncomeNew,
                effectiveRate: effectiveRateNew,
                marginalRate: marginalRateNew,
                deductionUtilization: deductionUtilizationNew,
                takeHomePercentage: takeHomePercentageNew,
            },
            savings: {
                amount: savings,
                percentage: savingsPercentage,
            },
        })
    }

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value)
    }

    // ── Register data with assistant context ──
    const taxVisuals = useMemo(() => {
        if (!taxResult) return [];
        return [
            { id: "tax-comparison", type: "bar" as const, title: "Tax Comparison", unit: "₹", data: [{ name: "Tax Liability", "Old Regime": taxResult.oldRegime.totalTax, "New Regime": taxResult.newRegime.totalTax }] },
            { id: "tax-effective-rate", type: "composed" as const, title: "Effective Tax Rate", unit: "%", data: [{ name: "Effective Rate", "Old Regime": taxResult.oldRegime.effectiveRate, "New Regime": taxResult.newRegime.effectiveRate }] },
            { id: "tax-old-breakdown", type: "pie" as const, title: "Old Regime Breakdown", unit: "₹", data: [{ name: "Income Tax", value: taxResult.oldRegime.tax }, { name: "Cess", value: taxResult.oldRegime.cess }] },
            { id: "tax-new-breakdown", type: "pie" as const, title: "New Regime Breakdown", unit: "₹", data: [{ name: "Income Tax", value: taxResult.newRegime.tax }, { name: "Cess", value: taxResult.newRegime.cess }] },
        ];
    }, [taxResult]);

    const taxSummaries = useMemo(() => {
        if (!taxResult) return [];
        return [
            { id: "tax-old-total", label: "Old Regime Total Tax", value: taxResult.oldRegime.totalTax },
            { id: "tax-new-total", label: "New Regime Total Tax", value: taxResult.newRegime.totalTax },
            { id: "tax-savings", label: "Savings", value: taxResult.savings.amount },
            { id: "tax-savings-pct", label: "Savings %", value: `${taxResult.savings.percentage.toFixed(1)}%` },
            { id: "tax-old-effective", label: "Old Effective Rate", value: `${taxResult.oldRegime.effectiveRate.toFixed(1)}%` },
            { id: "tax-new-effective", label: "New Effective Rate", value: `${taxResult.newRegime.effectiveRate.toFixed(1)}%` },
        ];
    }, [taxResult]);

    const assistantCtx = useAssistantContext();
    useEffect(() => { assistantCtx.setCurrentPage("tax-calculator"); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    useRegisterAssistantData({ page: "tax-calculator", visuals: taxVisuals, summaries: taxSummaries, metadata: { ageGroup, grossIncome } });

    return (
        <div className="min-h-screen bg-white">
            {/* Navigation */}
            <nav className="bg-white/80 backdrop-blur-xl border-b border-border/40">
                <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.back()}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <Link href="/" className="flex items-center gap-2">
                            <Calculator className="w-6 h-6 text-primary" />
                            <span className="font-bold text-lg hidden sm:inline">Tax Calculator</span>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-foreground mb-3">Income Tax Calculator</h1>
                    <p className="text-lg text-muted-foreground">
                        Compare your tax liability between old and new tax regimes for FY 2025-26. Enter your details to see which regime saves you more tax!
                    </p>
                </div>

                <div className="space-y-8">
                    {/* Input Section - Full Width at Top */}
                    <Card data-assistant-id="tax-form" className="p-6">
                        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                            <Calculator className="w-5 h-5" />
                            Enter Details
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Age Group
                                </label>
                                <select
                                    value={ageGroup}
                                    onChange={(e) => setAgeGroup(e.target.value as any)}
                                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                >
                                    <option value="below60">Below 60 years</option>
                                    <option value="senior">Senior Citizen (60-80 years)</option>
                                    <option value="supersenior">Super Senior (Above 80 years)</option>
                                </select>
                            </div>

                            {/* Gross Income */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Gross Annual Income *
                                </label>
                                <input
                                    type="number"
                                    value={grossIncome}
                                    onChange={(e) => setGrossIncome(e.target.value)}
                                    placeholder="Enter amount"
                                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            {/* Standard Deduction */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Standard Deduction
                                </label>
                                <input
                                    type="number"
                                    value={standardDeduction}
                                    onChange={(e) => setStandardDeduction(e.target.value)}
                                    placeholder="₹50,000 (default)"
                                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            {/* Section 80C */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Section 80C (Insurance, PPF, etc.)
                                </label>
                                <input
                                    type="number"
                                    value={section80C}
                                    onChange={(e) => setSection80C(e.target.value)}
                                    placeholder="Upto ₹1,50,000"
                                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            {/* Section 80D */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Section 80D (Health Insurance)
                                </label>
                                <input
                                    type="number"
                                    value={section80D}
                                    onChange={(e) => setSection80D(e.target.value)}
                                    placeholder="Health insurance premium"
                                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            {/* Section 80E */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Section 80E (Education Loan Interest)
                                </label>
                                <input
                                    type="number"
                                    value={section80E}
                                    onChange={(e) => setSection80E(e.target.value)}
                                    placeholder="Education loan interest"
                                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            {/* Section 80TTA */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Section 80TTA (Savings Account Interest)
                                </label>
                                <input
                                    type="number"
                                    value={section80TTA}
                                    onChange={(e) => setSection80TTA(e.target.value)}
                                    placeholder="Upto ₹10,000"
                                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            {/* HRA */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    House Rent Allowance (HRA)
                                </label>
                                <input
                                    type="number"
                                    value={HRA}
                                    onChange={(e) => setHRA(e.target.value)}
                                    placeholder="HRA exemption (Old regime only)"
                                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            {/* Other Deductions */}
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Other Deductions
                                </label>
                                <input
                                    type="number"
                                    value={otherDeductions}
                                    onChange={(e) => setOtherDeductions(e.target.value)}
                                    placeholder="Any other deductions"
                                    className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                        </div>

                        {/* Calculate Button - Full Width Below Inputs */}
                        <Button
                            onClick={handleCalculate}
                            className="w-full bg-primary hover:bg-primary/90 mt-6"
                            size="lg"
                        >
                            Calculate Tax
                        </Button>
                    </Card>

                    {/* Results Section */}
                    {taxResult ? (
                        <div data-assistant-id="comparison-section" className="space-y-8">
                            {/* Comparison Header */}
                            <div className="bg-gradient-to-r from-primary/10 to-blue-500/10 rounded-lg p-6 border border-primary/20">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-muted-foreground">
                                            {taxResult.savings.amount > 0 ? 'You Save in New Regime' : 'You Save in Old Regime'}
                                        </p>
                                        <p className="text-4xl font-bold text-primary">
                                            {formatCurrency(Math.abs(taxResult.savings.amount))}
                                        </p>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {Math.abs(taxResult.savings.percentage).toFixed(1)}% savings
                                        </p>
                                    </div>
                                    <TrendingDown className="w-16 h-16 text-green-500 opacity-30" />
                                </div>
                            </div>

                            {/* Charts Section - Below Comparison */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Tax Comparison Bar Chart */}
                                <Card className="p-6 border border-border/40">
                                    <h3 className="font-bold text-lg mb-4">📊 Total Tax Comparison</h3>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart
                                            data={[
                                                {
                                                    name: 'Tax Liability',
                                                    'Old Regime': taxResult.oldRegime.totalTax,
                                                    'New Regime': taxResult.newRegime.totalTax,
                                                },
                                            ]}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" />
                                            <YAxis />
                                            <Tooltip
                                                formatter={(value) => formatCurrency(value)}
                                                contentStyle={{ backgroundColor: '#f5f5f5', border: '1px solid #ddd' }}
                                            />
                                            <Legend />
                                            <Bar dataKey="Old Regime" fill="#f97316" />
                                            <Bar dataKey="New Regime" fill="#10b981" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Card>

                                {/* Effective Tax Rate Comparison */}
                                <Card className="p-6 border border-border/40">
                                    <h3 className="font-bold text-lg mb-4">📈 Effective Tax Rate (%)</h3>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <ComposedChart
                                            data={[
                                                {
                                                    name: 'Effective Rate',
                                                    'Old Regime': taxResult.oldRegime.effectiveRate,
                                                    'New Regime': taxResult.newRegime.effectiveRate,
                                                },
                                            ]}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" />
                                            <YAxis />
                                            <Tooltip
                                                formatter={(value) => `${value.toFixed(2)}%`}
                                                contentStyle={{ backgroundColor: '#f5f5f5', border: '1px solid #ddd' }}
                                            />
                                            <Legend />
                                            <Bar dataKey="Old Regime" fill="#f97316" />
                                            <Bar dataKey="New Regime" fill="#10b981" />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </Card>
                            </div>

                            {/* Pie Charts - Tax Breakdown */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Old Regime Tax Breakdown */}
                                <Card className="p-6 border border-orange-200 bg-orange-50/30">
                                    <h3 className="font-bold text-lg mb-4 text-orange-900">📋 Old Regime Breakdown</h3>
                                    <ResponsiveContainer width="100%" height={280}>
                                        <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                            <Pie
                                                data={[
                                                    { name: 'Income Tax', value: taxResult.oldRegime.tax },
                                                    { name: 'Cess', value: taxResult.oldRegime.cess },
                                                ]}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                                                outerRadius={70}
                                                fill="#8884d8"
                                                dataKey="value"
                                            >
                                                <Cell fill="#f97316" />
                                                <Cell fill="#fca5a5" />
                                            </Pie>
                                            <Tooltip formatter={(value) => formatCurrency(value)} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </Card>

                                {/* New Regime Tax Breakdown */}
                                <Card className="p-6 border border-green-200 bg-green-50/30">
                                    <h3 className="font-bold text-lg mb-4 text-green-900">📋 New Regime Breakdown</h3>
                                    <ResponsiveContainer width="100%" height={280}>
                                        <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                            <Pie
                                                data={[
                                                    { name: 'Income Tax', value: taxResult.newRegime.tax },
                                                    { name: 'Cess', value: taxResult.newRegime.cess },
                                                ]}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                                                outerRadius={70}
                                                fill="#8884d8"
                                                dataKey="value"
                                            >
                                                <Cell fill="#10b981" />
                                                <Cell fill="#86efac" />
                                            </Pie>
                                            <Tooltip formatter={(value) => formatCurrency(value)} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </Card>
                            </div>

                            {/* Results Cards - Old & New Regime Comparison */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Old Regime Details - Dynamic Color */}
                                <Card className={`p-6 border-2 ${taxResult.savings.amount < 0 ? 'border-green-200 bg-green-50/30' : 'border-yellow-200 bg-yellow-50/30'}`}>
                                    <h3 className={`text-xl font-bold mb-6 ${taxResult.savings.amount < 0 ? 'text-green-900' : 'text-yellow-900'}`}>
                                        💰 Old Tax Regime {taxResult.savings.amount < 0 && '(Saves More)'}
                                    </h3>

                                    <div className="space-y-4">
                                        <div className={`flex justify-between items-center pb-4 border-b ${taxResult.savings.amount < 0 ? 'border-green-200' : 'border-yellow-200'}`}>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Gross Income</p>
                                                <p className="font-semibold">{formatCurrency(parseFloat(grossIncome || '0'))}</p>
                                            </div>
                                        </div>

                                        <div className={`flex justify-between items-center pb-4 border-b ${taxResult.savings.amount < 0 ? 'border-green-200' : 'border-yellow-200'}`}>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Total Deductions</p>
                                                <p className="font-semibold">{formatCurrency(parseFloat(grossIncome || '0') - taxResult.oldRegime.taxableIncome)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-xs ${taxResult.savings.amount < 0 ? 'text-green-600' : 'text-yellow-600'}`}>Utilization</p>
                                                <p className={`font-semibold ${taxResult.savings.amount < 0 ? 'text-green-600' : 'text-yellow-600'}`}>{taxResult.oldRegime.deductionUtilization.toFixed(1)}%</p>
                                            </div>
                                        </div>

                                        <div className={`flex justify-between items-center pb-4 border-b ${taxResult.savings.amount < 0 ? 'border-green-200' : 'border-yellow-200'}`}>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Taxable Income</p>
                                                <p className="font-semibold">{formatCurrency(taxResult.oldRegime.taxableIncome)}</p>
                                            </div>
                                        </div>

                                        <div className={`grid grid-cols-2 gap-4 pb-4 border-b ${taxResult.savings.amount < 0 ? 'border-green-200' : 'border-yellow-200'}`}>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Income Tax</p>
                                                <p className="font-semibold">{formatCurrency(taxResult.oldRegime.tax)}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Cess (4%)</p>
                                                <p className="font-semibold">{formatCurrency(taxResult.oldRegime.cess)}</p>
                                            </div>
                                        </div>

                                        <div className={`grid grid-cols-2 gap-4 pb-4 border-b ${taxResult.savings.amount < 0 ? 'border-green-200' : 'border-yellow-200'}`}>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Effective Rate</p>
                                                <p className={`font-semibold ${taxResult.savings.amount < 0 ? 'text-green-600' : 'text-yellow-600'}`}>{taxResult.oldRegime.effectiveRate.toFixed(2)}%</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Marginal Rate</p>
                                                <p className={`font-semibold ${taxResult.savings.amount < 0 ? 'text-green-600' : 'text-yellow-600'}`}>{taxResult.oldRegime.marginalRate}%</p>
                                            </div>
                                        </div>

                                        <div className="bg-white/50 p-4 rounded-lg space-y-3">
                                            <div className="flex justify-between font-bold text-lg">
                                                <span>Total Tax Liability</span>
                                                <span className={taxResult.savings.amount < 0 ? 'text-green-600' : 'text-yellow-600'}>{formatCurrency(taxResult.oldRegime.totalTax)}</span>
                                            </div>
                                            <div className={`flex justify-between pt-3 border-t ${taxResult.savings.amount < 0 ? 'text-green-600 border-green-200' : 'text-yellow-600 border-yellow-200'}`}>
                                                <span>Net Income (After Tax)</span>
                                                <span className="font-bold">{formatCurrency(taxResult.oldRegime.netIncome)}</span>
                                            </div>
                                            <div className="flex justify-between text-blue-600">
                                                <span>Take-Home %</span>
                                                <span className="font-bold">{taxResult.oldRegime.takeHomePercentage.toFixed(1)}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </Card>

                                {/* New Regime Details - Dynamic Color */}
                                <Card className={`p-6 border-2 ${taxResult.savings.amount > 0 ? 'border-green-200 bg-green-50/30' : 'border-yellow-200 bg-yellow-50/30'}`}>
                                    <h3 className={`text-xl font-bold mb-6 ${taxResult.savings.amount > 0 ? 'text-green-900' : 'text-yellow-900'}`}>
                                        💚 New Tax Regime {taxResult.savings.amount > 0 && '(Saves More)'}
                                    </h3>

                                    <div className="space-y-4">
                                        <div className={`flex justify-between items-center pb-4 border-b ${taxResult.savings.amount > 0 ? 'border-green-200' : 'border-yellow-200'}`}>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Gross Income</p>
                                                <p className="font-semibold">{formatCurrency(parseFloat(grossIncome || '0'))}</p>
                                            </div>
                                        </div>

                                        <div className={`flex justify-between items-center pb-4 border-b ${taxResult.savings.amount > 0 ? 'border-green-200' : 'border-yellow-200'}`}>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Standard Deduction</p>
                                                <p className="font-semibold">{formatCurrency(parseFloat(standardDeduction || '0'))}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-xs ${taxResult.savings.amount > 0 ? 'text-green-600' : 'text-yellow-600'}`}>Utilization</p>
                                                <p className={`font-semibold ${taxResult.savings.amount > 0 ? 'text-green-600' : 'text-yellow-600'}`}>{taxResult.newRegime.deductionUtilization.toFixed(1)}%</p>
                                            </div>
                                        </div>

                                        <div className={`flex justify-between items-center pb-4 border-b ${taxResult.savings.amount > 0 ? 'border-green-200' : 'border-yellow-200'}`}>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Taxable Income</p>
                                                <p className="font-semibold">{formatCurrency(taxResult.newRegime.taxableIncome)}</p>
                                            </div>
                                        </div>

                                        <div className={`grid grid-cols-2 gap-4 pb-4 border-b ${taxResult.savings.amount > 0 ? 'border-green-200' : 'border-yellow-200'}`}>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Income Tax</p>
                                                <p className="font-semibold">{formatCurrency(taxResult.newRegime.tax)}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Cess (4%)</p>
                                                <p className="font-semibold">{formatCurrency(taxResult.newRegime.cess)}</p>
                                            </div>
                                        </div>

                                        <div className={`grid grid-cols-2 gap-4 pb-4 border-b ${taxResult.savings.amount > 0 ? 'border-green-200' : 'border-yellow-200'}`}>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Effective Rate</p>
                                                <p className={`font-semibold ${taxResult.savings.amount > 0 ? 'text-green-600' : 'text-yellow-600'}`}>{taxResult.newRegime.effectiveRate.toFixed(2)}%</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Marginal Rate</p>
                                                <p className={`font-semibold ${taxResult.savings.amount > 0 ? 'text-green-600' : 'text-yellow-600'}`}>{taxResult.newRegime.marginalRate}%</p>
                                            </div>
                                        </div>

                                        <div className="bg-white/50 p-4 rounded-lg space-y-3">
                                            <div className="flex justify-between font-bold text-lg">
                                                <span>Total Tax Liability</span>
                                                <span className={taxResult.savings.amount < 0 ? 'text-green-600' : 'text-yellow-600'}>{formatCurrency(taxResult.newRegime.totalTax)}</span>
                                            </div>
                                            <div className={`flex justify-between pt-3 border-t ${taxResult.savings.amount < 0 ? 'text-green-600 border-green-200' : 'text-yellow-600 border-yellow-200'}`}>
                                                <span>Net Income (After Tax)</span>
                                                <span className="font-bold">{formatCurrency(taxResult.newRegime.netIncome)}</span>
                                            </div>
                                            <div className="flex justify-between text-blue-600">
                                                <span>Take-Home %</span>
                                                <span className="font-bold">{taxResult.newRegime.takeHomePercentage.toFixed(1)}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            </div>

                            {/* Charts Section - Below Comparison */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Tax Comparison Bar Chart */}
                                <Card className="p-6 border border-border/40">
                                    <h3 className="font-bold text-lg mb-4">📊 Total Tax Comparison</h3>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart
                                            data={[
                                                {
                                                    name: 'Tax Liability',
                                                    'Old Regime': taxResult.oldRegime.totalTax,
                                                    'New Regime': taxResult.newRegime.totalTax,
                                                },
                                            ]}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" />
                                            <YAxis />
                                            <Tooltip
                                                formatter={(value) => formatCurrency(value)}
                                                contentStyle={{ backgroundColor: '#f5f5f5', border: '1px solid #ddd' }}
                                            />
                                            <Legend />
                                            <Bar dataKey="Old Regime" fill="#f97316" />
                                            <Bar dataKey="New Regime" fill="#10b981" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </Card>

                                {/* Effective Tax Rate Comparison */}
                                <Card className="p-6 border border-border/40">
                                    <h3 className="font-bold text-lg mb-4">📈 Effective Tax Rate (%)</h3>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <ComposedChart
                                            data={[
                                                {
                                                    name: 'Effective Rate',
                                                    'Old Regime': taxResult.oldRegime.effectiveRate,
                                                    'New Regime': taxResult.newRegime.effectiveRate,
                                                },
                                            ]}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" />
                                            <YAxis />
                                            <Tooltip
                                                formatter={(value) => `${value.toFixed(2)}%`}
                                                contentStyle={{ backgroundColor: '#f5f5f5', border: '1px solid #ddd' }}
                                            />
                                            <Legend />
                                            <Bar dataKey="Old Regime" fill="#f97316" />
                                            <Bar dataKey="New Regime" fill="#10b981" />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </Card>
                            </div>

                            {/* Key Metrics Summary */}
                            <Card className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
                                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                                    <Info className="w-5 h-5" />
                                    Key Metrics Comparison
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-white p-4 rounded-lg border border-blue-100">
                                        <p className="text-xs text-muted-foreground mb-1">Effective Tax Rate</p>
                                        <p className="font-bold text-orange-600">{taxResult.oldRegime.effectiveRate.toFixed(2)}%</p>
                                        <p className="text-xs text-green-600 mt-1">vs {taxResult.newRegime.effectiveRate.toFixed(2)}%</p>
                                    </div>
                                    <div className="bg-white p-4 rounded-lg border border-blue-100">
                                        <p className="text-xs text-muted-foreground mb-1">Marginal Rate</p>
                                        <p className="font-bold text-orange-600">{taxResult.oldRegime.marginalRate}%</p>
                                        <p className="text-xs text-green-600 mt-1">vs {taxResult.newRegime.marginalRate}%</p>
                                    </div>
                                    <div className="bg-white p-4 rounded-lg border border-blue-100">
                                        <p className="text-xs text-muted-foreground mb-1">Deduction Utility</p>
                                        <p className="font-bold text-orange-600">{taxResult.oldRegime.deductionUtilization.toFixed(1)}%</p>
                                        <p className="text-xs text-green-600 mt-1">vs {taxResult.newRegime.deductionUtilization.toFixed(1)}%</p>
                                    </div>
                                    <div className="bg-white p-4 rounded-lg border border-blue-100">
                                        <p className="text-xs text-muted-foreground mb-1">Take-Home %</p>
                                        <p className="font-bold text-green-600">{taxResult.oldRegime.takeHomePercentage.toFixed(1)}%</p>
                                        <p className="text-xs text-blue-600 mt-1">vs {taxResult.newRegime.takeHomePercentage.toFixed(1)}%</p>
                                    </div>
                                </div>
                            </Card>

                            {/* Recommendation */}
                            <Card className="p-6 bg-blue-50/30 border border-blue-200">
                                <h3 className="font-bold text-lg mb-3">💡 Recommendation</h3>
                                <p className="text-muted-foreground mb-4">
                                    {taxResult.savings.amount > 0
                                        ? `Based on your income and deductions, you should choose the NEW REGIME as it saves you ₹${Math.abs(taxResult.savings.amount).toLocaleString('en-IN')} (${Math.abs(taxResult.savings.percentage).toFixed(1)}% savings). The simpler structure with lower rates makes the New Regime more beneficial for you.`
                                        : `Based on your income and deductions, you should choose the OLD REGIME as it saves you ₹${Math.abs(taxResult.savings.amount).toLocaleString('en-IN')} (${Math.abs(taxResult.savings.percentage).toFixed(1)}% savings). With ${taxResult.oldRegime.deductionUtilization.toFixed(1)}% deduction utilization, the Old Regime maximizes your deductions.`}
                                </p>
                                <p className="text-sm text-blue-700 font-semibold">
                                    ⚠️ Always consult with a tax professional for personalized advice before filing your returns.
                                </p>
                            </Card>
                        </div>
                    ) : (
                        <Card className="p-12 text-center">
                            <Calculator className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                            <p className="text-muted-foreground text-lg">
                                Enter your income details and click "Calculate Tax" to see the comparison
                            </p>
                        </Card>
                    )}
                </div>
            </div >
        </div >
    )
}
