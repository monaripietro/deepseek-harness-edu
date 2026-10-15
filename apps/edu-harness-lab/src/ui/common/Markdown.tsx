import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import styles from './Markdown.module.css'

/** Markdown with GFM tables. Raw HTML is never rendered. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className={styles.md}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" />,
          table: ({ node: _n, ...p }) => (
            <div className={styles.tableWrap}>
              <table {...p} />
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
