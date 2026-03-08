'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownMessageProps {
    content: string
    className?: string
}

export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
    return (
        <div className={cn('prose prose-sm max-w-none break-words', className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    // Headers
                    h1: ({ children }) => (
                        <h1 className="text-xl font-bold text-foreground mt-4 mb-2">{children}</h1>
                    ),
                    h2: ({ children }) => (
                        <h2 className="text-lg font-bold text-foreground mt-3 mb-2">{children}</h2>
                    ),
                    h3: ({ children }) => (
                        <h3 className="text-base font-semibold text-foreground mt-2 mb-1">{children}</h3>
                    ),

                    // Paragraphs
                    p: ({ children }) => (
                        <p className="text-sm leading-relaxed text-foreground my-2 break-words whitespace-pre-wrap">{children}</p>
                    ),

                    // Strong/Bold
                    strong: ({ children }) => (
                        <strong className="font-bold text-primary">{children}</strong>
                    ),

                    // Tables
                    table: ({ children }) => (
                        <div className="my-4 overflow-x-auto rounded-lg border border-border">
                            <table className="w-full border-collapse">{children}</table>
                        </div>
                    ),
                    thead: ({ children }) => (
                        <thead className="bg-primary/10">{children}</thead>
                    ),
                    tbody: ({ children }) => (
                        <tbody className="divide-y divide-border">{children}</tbody>
                    ),
                    tr: ({ children }) => (
                        <tr className="hover:bg-muted/50 transition-colors">{children}</tr>
                    ),
                    th: ({ children }) => (
                        <th className="px-4 py-2 text-left text-xs font-semibold text-foreground border-b border-border">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => (
                        <td className="px-4 py-2 text-sm text-foreground">{children}</td>
                    ),

                    // Lists
                    ul: ({ children }) => (
                        <ul className="list-disc list-inside space-y-1 my-3 text-sm text-foreground">
                            {children}
                        </ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="list-decimal list-inside space-y-1 my-3 text-sm text-foreground">
                            {children}
                        </ol>
                    ),
                    li: ({ children }) => (
                        <li className="leading-relaxed break-words">{children}</li>
                    ),

                    // Code blocks
                    code: ({ children, className }) => {
                        const isInline = !className;
                        return isInline ? (
                            <code className="px-1.5 py-0.5 rounded bg-muted text-primary text-xs font-mono">
                                {children}
                            </code>
                        ) : (
                            <code className="block px-4 py-3 rounded-lg bg-muted text-foreground text-xs font-mono overflow-x-auto my-2">
                                {children}
                            </code>
                        )
                    },
                    pre: ({ children }) => (
                        <pre className="my-2">{children}</pre>
                    ),

                    // Blockquotes
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-primary pl-4 py-2 my-3 italic text-muted-foreground">
                            {children}
                        </blockquote>
                    ),

                    // Links
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80 underline font-medium"
                        >
                            {children}
                        </a>
                    ),

                    // Horizontal rule
                    hr: () => (
                        <hr className="my-4 border-border" />
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    )
}
