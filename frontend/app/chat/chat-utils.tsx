'use client'

import {
    Tooltip as UiTooltip,
    TooltipContent as UiTooltipContent,
    TooltipProvider as UiTooltipProvider,
    TooltipTrigger as UiTooltipTrigger,
} from '@/components/ui/tooltip'

export const cleanSnippetText = (text: string) =>
    text
        .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
        .replace(/(\w)-\s+(\w)/g, '$1$2')
        .replace(/\b(?:[A-Za-z]\s+){2,}[A-Za-z]\b/g, (m) => m.replace(/\s+/g, ''))
        .replace(/\s*#{1,6}\s*/g, ' ')
        .replace(/all rights reserved|copyright protected document/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()

export const shortenSourceName = (name: string, maxLength = 32) =>
    name.length > maxLength ? `${name.slice(0, maxLength - 1)}…` : name

export const SourceWithTooltip = ({
    source,
    maxLength = 32,
    className,
    prefix = '',
    onClick,
}: {
    source: string
    maxLength?: number
    className: string
    prefix?: string
    onClick?: () => void
}) => (
    <UiTooltipProvider delayDuration={150}>
        <UiTooltip>
            <UiTooltipTrigger asChild>
                {onClick ? (
                    <button type="button" onClick={onClick} className={className}>
                        {prefix}
                        {shortenSourceName(source, maxLength)}
                    </button>
                ) : (
                    <span className={className}>
                        {prefix}
                        {shortenSourceName(source, maxLength)}
                    </span>
                )}
            </UiTooltipTrigger>
            <UiTooltipContent className="max-w-sm break-all">{source}</UiTooltipContent>
        </UiTooltip>
    </UiTooltipProvider>
)
