'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowRight, FileText, Zap, Users, Globe, Shield, BookOpen, Database, Cpu, Github, Mail, Phone, CheckCircle2, TrendingUp, BarChart3, Lightbulb, Award, Calculator } from 'lucide-react'
import { useEffect, useState, type MouseEvent } from "react"
import { AuthButtons, MobileAuthButtons } from '@/components/user-menu'
import { useAuth } from '@/components/auth-provider'
import { Logo } from '@/components/logo'
import { LiveStats } from '@/components/live-stats'

export default function Page() {
  const router = useRouter()
  const { user } = useAuth()
  const [msg, setMsg] = useState("")

  const handleGetStarted = () => {
    if (!user) {
      // Send unauthenticated users to login to sign in first
      router.push('/login')
      return
    }

    const savedProfile = localStorage.getItem('userProfile')
    const parsed = savedProfile ? JSON.parse(savedProfile) : null

    if (parsed?.isProfileComplete) {
      router.push('/chat')
      return
    }

    router.push('/profile-setup')
  }

  const handlePointerMove = (event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    event.currentTarget.style.setProperty('--mx', `${x}px`)
    event.currentTarget.style.setProperty('--my', `${y}px`)
  }

  // useEffect(() => {
  //   fetch("http://localhost:8000/ping")
  //     .then(res => res.json())
  //     .then(data => setMsg(data.status))
  //     .catch(() => setMsg("Backend not connected"))
  // }, [])
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-white via-blue-50/30 to-emerald-50/20">
      <div className="pointer-events-none absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-20 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/75 backdrop-blur-xl border-b border-border/40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <Logo size="md" showText={true} href="/" />
          <div className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-sm text-foreground hover:text-primary transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0">How It Works</a>
            <a href="#features" className="text-sm text-foreground hover:text-primary transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0">Features</a>
            <a href="#testimonials" className="text-sm text-foreground hover:text-primary transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0">Use Cases</a>
            <Link href="/tax-calculator" className="text-sm text-foreground hover:text-primary transition-all duration-200 hover:-translate-y-0.5 active:scale-95 font-medium bg-primary/10 px-3 py-1 rounded-lg hover:bg-primary/20">
              Tax Calculator
            </Link>
            <AuthButtons />
          </div>
          <div className="md:hidden">
            <MobileAuthButtons />
          </div>
        </div>
      </nav>

      {/* {msg && (
        <p className="mt-2 mx-auto w-fit text-sm text-primary font-medium rounded-full border border-primary/20 bg-primary/5 px-4 py-1">
          {msg}
        </p>
      )} */}

      {/* Hero Section */}
      <section className="relative px-4 md:px-6 py-2 md:py-4 max-w-7xl mx-auto overflow-hidden">
        <div className="absolute top-20 right-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />

        <div className="relative text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 mb-6 backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:shadow-primary/20 hover:-translate-y-0.5">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <p className="text-sm text-primary font-semibold">AI-Powered Financial Guidance</p>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-5 text-pretty leading-tight">
            Navigate Indian <span className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">Finance with Ease</span>
          </h1>

          <p className="text-base md:text-lg text-muted-foreground mb-8 max-w-2xl mx-auto text-pretty leading-relaxed">
            Understand complex tax laws, government schemes, and investment options in simple language. Get personalized financial guidance powered by advanced AI and official government data.
          </p>

          <div className="flex flex-col md:flex-row gap-3 justify-center mb-10">
            <Button className="w-full md:w-auto transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/25 active:scale-95" onClick={handleGetStarted}>
              Try Arth Mitra
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button className="w-full md:w-auto bg-slate-600 border border-border hover:bg-slate-700 transition-all duration-200 hover:-translate-y-0.5 active:scale-95">
              Watch Demo Video
              {/*Remember to add a demo link*/}
            </Button>
          </div>

          {/* Stats Row - Live Analytics */}
          <div className="mt-6">
            <LiveStats />
          </div>
        </div>
      </section>

      {/* How It Works - Detailed */}
      <section id="how-it-works" className="px-4 md:px-6 py-16 md:py-20 bg-gradient-to-b from-blue-50/50 to-white border-y border-border/40">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-sm mb-3">
              <Cpu className="w-4 h-4 text-primary" />
              <p className="text-xs text-primary font-semibold">RAG Architecture</p>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-2">How Arth Mitra Works</h2>
            <p className="text-base text-muted-foreground max-w-2xl mx-auto">
              Our advanced Retrieval-Augmented Generation system combines real government data with cutting-edge AI
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-4 md:gap-2 mb-8">
            {[
              {
                icon: Database,
                title: 'Official Documents',
                desc: 'Collect & index government data',
                details: 'ITR forms, tax circulars, scheme guidelines'
              },
              {
                icon: Cpu,
                title: 'AI Processing',
                desc: 'Convert to vector embeddings',
                details: 'Semantic understanding via LLMs'
              },
              {
                icon: Users,
                title: 'Your Question',
                desc: 'Ask in your own words',
                details: 'Natural language processing'
              },
              {
                icon: FileText,
                title: 'Smart Retrieval',
                desc: 'Find relevant government rules',
                details: 'Context-aware matching'
              },
              {
                icon: Zap,
                title: 'Plain Answer',
                desc: 'Get explained in simple terms',
                details: 'Personalized to your situation'
              }
            ].map((step, i) => (
              <div key={i} className="flex flex-col items-center relative">
                <div
                  onMouseMove={handlePointerMove}
                  className="group relative w-full rounded-2xl border border-primary/20 bg-white/70 p-4 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10 active:scale-[0.99]"
                >
                  <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: 'radial-gradient(220px circle at var(--mx, 50%) var(--my, 50%), rgba(59,130,246,0.16), transparent 60%)' }} />
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/25 to-primary/10 flex items-center justify-center mb-4 border border-primary/20 mx-auto">
                    <step.icon className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="font-bold text-foreground text-sm md:text-base mb-1 text-center">{step.title}</h3>
                  <p className="text-xs text-muted-foreground text-center mb-2">{step.desc}</p>
                  <p className="text-xs text-muted-foreground/70 text-center italic">{step.details}</p>
                </div>
                {i < 4 && <div className="hidden md:block absolute right-0 top-8 text-border/40 text-2xl">â†’</div>}
              </div>
            ))}
          </div>

          {/* Trust Indicators */}
          <div className="grid md:grid-cols-3 gap-6 bg-white/85 rounded-2xl p-8 border border-border/40 shadow-sm backdrop-blur-sm">
            {[
              { icon: Shield, title: 'Bank-Grade Security', desc: 'End-to-end encryption & HTTPS' },
              { icon: CheckCircle2, title: 'Government Data', desc: 'Only official sources & guidelines' },
              { icon: Award, title: 'Expert Verified', desc: 'Reviewed by tax & finance professionals' }
            ].map((indicator, i) => (
              <div key={i} onMouseMove={handlePointerMove} className="group relative overflow-hidden rounded-xl p-3 -m-3 flex gap-4 transition-all duration-200 hover:bg-primary/5 hover:shadow-sm">
                <div className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: 'radial-gradient(180px circle at var(--mx, 50%) var(--my, 50%), rgba(34,197,94,0.12), transparent 60%)' }} />
                <indicator.icon className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-semibold text-foreground mb-1">{indicator.title}</h4>
                  <p className="text-sm text-muted-foreground">{indicator.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Features - Enhanced */}
      <section id="features" className="px-4 md:px-6 py-12 max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 mb-3 backdrop-blur-sm">
            <Lightbulb className="w-4 h-4 text-primary" />
            <p className="text-xs text-primary font-semibold">Powerful Features</p>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-2">Everything You Need</h2>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">Comprehensive tools for financial clarity and peace of mind</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: BookOpen,
              title: 'Plain Language Explanations',
              desc: 'Complex tax laws, schemes, and regulations explained in simple, everyday language you understand',
              color: 'from-primary/20 to-primary/5'
            },
            {
              icon: TrendingUp,
              title: 'Personalized Recommendations',
              desc: 'AI learns your income, age, and goals to suggest strategies tailored to your unique situation',
              color: 'from-accent/20 to-accent/5'
            },
            {
              icon: FileText,
              title: 'Step-by-Step Tax Filing',
              desc: 'Complete guidance on filing income tax returns with forms, schedules, and investment verification',
              color: 'from-blue-400/20 to-blue-400/5'
            },
            {
              icon: Globe,
              title: 'Multilingual Support',
              desc: 'Communicate in Hindi, English, Tamil, Telugu, Kannada, and Marathi for complete accessibility',
              color: 'from-green-400/20 to-green-400/5'
            },
            {
              icon: Shield,
              title: 'Secure & Private',
              desc: 'Your financial data is encrypted, never stored, and compliant with RBI guidelines',
              color: 'from-red-400/20 to-red-400/5'
            },
            {
              icon: Database,
              title: 'Real-Time Updates',
              desc: 'Latest tax law changes, scheme updates, and government policy changes reflected instantly',
              color: 'from-cyan-400/20 to-cyan-400/5'
            },
            {
              icon: Calculator,
              title: 'Tax Calculator',
              desc: 'Compare old and new tax regimes instantly. Calculate your tax liability with deductions included',
              color: 'from-yellow-400/20 to-yellow-400/5',
              link: '/tax-calculator'
            }
          ].map((feature, i) => (
            <div key={i}>
              {feature.link ? (
                <Link href={feature.link}>
                  <Card
                    onMouseMove={handlePointerMove}
                    className="p-8 hover:shadow-xl transition-all duration-300 border border-border/40 group cursor-pointer h-full relative overflow-hidden hover:-translate-y-1 active:scale-[0.99] bg-white/85 backdrop-blur-sm"
                  >
                    <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: 'radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(59,130,246,0.14), transparent 62%)' }} />
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                      <feature.icon className="w-7 h-7 text-primary" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-3">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                  </Card>
                </Link>
              ) : (
                <Card
                  onMouseMove={handlePointerMove}
                  className="p-8 hover:shadow-xl transition-all duration-300 border border-border/40 group cursor-pointer h-full relative overflow-hidden hover:-translate-y-1 active:scale-[0.99] bg-white/85 backdrop-blur-sm"
                >
                  <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: 'radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(34,197,94,0.14), transparent 62%)' }} />
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                    <feature.icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-3">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </Card>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Real Use Cases / Chat Examples */}
      <section id="testimonials" className="px-4 md:px-6 py-12 bg-gradient-to-b from-blue-50/60 via-emerald-50/20 to-white border-t border-b border-border/40">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 mb-3 backdrop-blur-sm">
              <BarChart3 className="w-4 h-4 text-primary" />
              <p className="text-xs text-primary font-semibold">Real Examples</p>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-2">See Arth Mitra In Action</h2>
            <p className="text-base text-muted-foreground max-w-2xl mx-auto">Real scenarios where users got clarity and saved money</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Example 1 - Tax Saving */}
            <Card
              onMouseMove={handlePointerMove}
              className="p-8 bg-white/85 border border-border/40 overflow-hidden group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 active:scale-[0.99] relative backdrop-blur-sm"
            >
              <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: 'radial-gradient(260px circle at var(--mx, 50%) var(--my, 50%), rgba(59,130,246,0.12), transparent 65%)' }} />
              <div className="mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 mb-4">
                  <span className="text-xs font-semibold text-primary">Salaried Professional</span>
                </div>
                <p className="text-lg font-semibold text-foreground">How much tax can I save?</p>
              </div>

              <div className="space-y-4 mb-6">
                <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg p-4 border border-primary/20">
                  <p className="text-sm font-medium text-foreground mb-2">Your Question:</p>
                  <p className="text-sm text-muted-foreground">I earn â‚¹15 lakh per year. What are all the tax deductions I can claim?</p>
                </div>

                <div className="bg-gradient-to-r from-accent/10 to-accent/5 rounded-lg p-4 border border-accent/20">
                  <p className="text-sm font-medium text-foreground mb-2">Arth Mitra's Answer:</p>
                  <div className="space-y-2 text-sm text-foreground">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                      <span><strong>Section 80C:</strong> Up to â‚¹1.5L (PPF, ELSS, LIC, investments)</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                      <span><strong>Section 80D:</strong> Health insurance up to â‚¹50K (â‚¹1L for senior parents)</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                      <span><strong>Section 80E:</strong> Education loan interest (no limit)</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                      <span><strong>Section 80G:</strong> Charity donations up to 50% of income</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200 transition-all duration-200 hover:shadow-sm">
                  <p className="text-sm font-semibold text-green-700 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Potential Tax Saving: Up to â‚¹2-3L per year!
                  </p>
                </div>
              </div>
            </Card>

            {/* Example 2 - Pension Planning */}
            <Card
              onMouseMove={handlePointerMove}
              className="p-8 bg-white/85 border border-border/40 overflow-hidden group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 active:scale-[0.99] relative backdrop-blur-sm"
            >
              <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: 'radial-gradient(260px circle at var(--mx, 50%) var(--my, 50%), rgba(34,197,94,0.14), transparent 65%)' }} />
              <div className="mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/30 mb-4">
                  <span className="text-xs font-semibold text-accent">Senior Citizen Planning</span>
                </div>
                <p className="text-lg font-semibold text-foreground">Best schemes for retirement?</p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    name: 'Atal Pension Yojana',
                    rate: 'Government Guaranteed',
                    desc: 'â‚¹1000-5000/month pension'
                  },
                  {
                    name: 'Senior Citizen Savings Scheme',
                    rate: '8.2% p.a.',
                    desc: 'Quarterly interest, â‚¹15L limit'
                  },
                  {
                    name: 'PM Vaya Vandana Yojana',
                    rate: '7.4% p.a.',
                    desc: 'Guaranteed 10 years, pension from 62'
                  },
                  {
                    name: 'National Pension System',
                    rate: 'Market Returns',
                    desc: 'Tax benefits + flexibility'
                  }
                ].map((scheme, i) => (
                  <Card key={i} className="p-3 bg-gradient-to-r from-blue-50 to-emerald-50/40 border border-blue-100 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]">
                    <p className="font-semibold text-sm text-foreground">{scheme.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground">{scheme.desc}</p>
                      <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded">{scheme.rate}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </section>



      {/* CTA Section */}
      <section className="px-4 md:px-6 py-12 bg-gradient-to-r from-primary/15 via-blue-100/50 to-accent/15 rounded-3xl max-w-7xl mx-auto mb-8 border border-primary/15 shadow-sm">
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Ready to Take Control?</h2>
          <p className="text-base text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join thousands of Indians who now understand their finances better and save thousands in taxes every year.
          </p>
          <div className="flex flex-col md:flex-row gap-3 justify-center">
            <Link href="/chat">
              <Button className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/25 active:scale-95">
                Try Arth Mitra
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="px-4 md:px-6 py-12 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-4">
          {[
            { q: 'Is Arth Mitra advice legally binding?', a: 'No. Arth Mitra provides informational guidance based on public government data. Always consult with a qualified tax professional or financial advisor before making important decisions.' },
            { q: 'How accurate is the information?', a: 'We use only official government sources and maintain 98% accuracy. Our AI is regularly updated with latest tax laws and scheme changes. However, always verify specific details for your situation.' },
            { q: 'Is my data secure?', a: 'Yes. We use bank-grade encryption (HTTPS/TLS), never store personal data permanently, and comply with all RBI guidelines. Your financial information is completely private.' },
            { q: 'Can I use this for GST/business taxes?', a: 'Currently, Arth Mitra focuses on personal income tax and investment schemes. We\'re working on business tax features for the future.' },
            { q: 'What if I have complex financial situations?', a: 'For complex cases, our Professional and Premium plans include access to expert consultations with experienced tax professionals.' }
          ].map((faq, i) => (
            <Card
              key={i}
              onMouseMove={handlePointerMove}
              className="group relative overflow-hidden p-6 border border-border/40 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.995] bg-white/85 backdrop-blur-sm"
            >
              <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: 'radial-gradient(260px circle at var(--mx, 50%) var(--my, 50%), rgba(14,165,233,0.12), transparent 65%)' }} />
              <h3 className="font-semibold text-foreground mb-2">{faq.q}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-gradient-to-b from-slate-50/50 to-white">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-12">
          <div className="grid md:grid-cols-5 gap-12 mb-12">
            <div className="md:col-span-1">
              <div className="flex items-center gap-3 mb-4">
                <Logo size="md" showText={false} href="/" />
              </div>
              <p className="text-sm text-muted-foreground">Making Indian finance simple for everyone.</p>
            </div>

            <div>
              <h4 className="font-bold text-foreground mb-4 text-sm">Product</h4>
              <ul className="space-y-2">
                <li><a href="https://github.com/aryanb1906/FinGuide?tab=readme-ov-file#-FinGuide---ai-powered-financial-assistant-for-india" className="text-sm text-muted-foreground hover:text-primary transition-colors">How It Works</a></li>
                <li><a href="https://github.com/aryanb1906/FinGuide?tab=readme-ov-file#-FinGuide---ai-powered-financial-assistant-for-india" className="text-sm text-muted-foreground hover:text-primary transition-colors">Features</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-foreground mb-4 text-sm">Company</h4>
              <ul className="space-y-2">
                <li><a href="https://github.com/aryanb1906/FinGuide?tab=readme-ov-file#-FinGuide---ai-powered-financial-assistant-for-india" className="text-sm text-muted-foreground hover:text-primary transition-colors">About Us</a></li>
                <li><a href="https://www.linkedin.com/in/aryan-bhargava/" className="text-sm text-muted-foreground hover:text-primary transition-colors">Contact</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-foreground mb-4 text-sm">Legal</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Terms of Service</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Disclaimer</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Security</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-foreground mb-4 text-sm">Connect</h4>
              <ul className="space-y-2">
                <li><a href="https://github.com/aryanb1906/FinGuide" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"><Github className="w-4 h-4" /> GitHub</a></li>
                <li><a href="https://github.com/aryanb1906/FinGuide" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-2"><Mail className="w-4 h-4" /> Email</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border/40 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-sm text-muted-foreground">Â© {new Date().getFullYear()} Arth Mitra. All rights reserved. Made with care for Indians.</p>
            <div className="flex items-center gap-6 mt-4 md:mt-0">
              <a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Status</a>
              <a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">Sitemap</a>
              <a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">RSS</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

