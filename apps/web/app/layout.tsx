import './globals.css'
import { Geist_Mono } from 'next/font/google'

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-data',
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={geistMono.variable}>
        <div className="app-shell">
          <nav className="sidebar">
            <div className="sidebar-brand">
              <span>🛰️</span>
              <div style={{ lineHeight: 1.1 }}>
                <div>DEGRADATION</div>
                <div style={{ color: 'var(--text-muted)' }}>WATCHER</div>
              </div>
            </div>
            
            <div className="sidebar-nav">
              <a href="/dashboard" className="nav-item">
                <span className="nav-icon">⎈</span>
                Dashboard
              </a>
              <a href="/assets" className="nav-item nav-item--active">
                <span className="nav-icon">⬡</span>
                Assets
              </a>
              <a href="/alerts" className="nav-item">
                <span className="nav-icon">⚠</span>
                Alerts
              </a>
            </div>
          </nav>
          
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
