import Link from 'next/link'
import Image from 'next/image'

interface LogoProps {
    size?: 'sm' | 'md' | 'lg' | 'xl'
    showText?: boolean
    showTagline?: boolean
    href?: string | null
}

const sizeClasses = {
    sm: {
        container: 'w-8 h-8',
        icon: 'w-4 h-4',
        text: 'text-sm',
        tagline: 'text-xs',
    },
    md: {
        container: 'w-10 h-10',
        icon: 'w-5 h-5',
        text: 'text-base',
        tagline: 'text-xs',
    },
    lg: {
        container: 'w-12 h-12',
        icon: 'w-6 h-6',
        text: 'text-lg',
        tagline: 'text-sm',
    },
    xl: {
        container: 'w-16 h-16',
        icon: 'w-8 h-8',
        text: 'text-2xl',
        tagline: 'text-base',
    },
}

export function Logo({
    size = 'md',
    showText = true,
    showTagline = false,
    href = '/'
}: LogoProps) {
    const sizes = sizeClasses[size]

    const logoContent = (
        <div className="flex items-center gap-3">
            <div className={`${sizes.container} rounded-xl flex items-center justify-center overflow-hidden`}>
                <Image
                    src="/mitrasvglogo.png"
                    alt="Arth Mitra Logo"
                    width={64}
                    height={64}
                    className="w-full h-full object-contain"
                />
            </div>

            {showText && (
                <div className="flex flex-col">
                    <span className={`${sizes.text} font-bold text-foreground leading-tight`}>
                        Arth Mitra
                    </span>
                    {showTagline && (
                        <span className={`${sizes.tagline} text-muted-foreground font-medium`}>
                            Your Financial Companion
                        </span>
                    )}
                </div>
            )}
        </div>
    )

    if (href) {
        return (
            <Link href={href} className="group cursor-pointer">
                {logoContent}
            </Link>
        )
    }

    return logoContent
}

// Logo icon only (for small spaces)
export function LogoIcon({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
    return <Logo size={size} showText={false} />
}

// Logo with tagline (for headers)
export function LogoWithTagline({ size = 'lg' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
    return <Logo size={size} showText={true} showTagline={true} href={null} />
}
