import React, { createContext, useContext, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AppSidebar } from '@/components/AppSidebar'
import { TopBar } from '@/components/TopBar'

interface SidebarContextType {
  mobileOpen: boolean
  toggleMobile: () => void
  closeMobile: () => void
}

const SidebarContext = createContext<SidebarContextType>({
  mobileOpen: false,
  toggleMobile: () => {},
  closeMobile: () => {},
})

export const useSidebarCtx = () => useContext(SidebarContext)

interface AppLayoutProps {
  cmdOpen?: boolean
  onCmdOpen?: (open: boolean) => void
}

const AppLayout: React.FC<AppLayoutProps> = ({ onCmdOpen }) => {
  const { session, loading } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="space-y-3 w-64">
          <div className="h-8 w-full animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-3/4 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/auth/login" replace />
  }

  return (
    <SidebarContext.Provider value={{
      mobileOpen,
      toggleMobile: () => setMobileOpen(v => !v),
      closeMobile: () => setMobileOpen(false),
    }}>
      <div className="flex h-screen bg-background overflow-hidden">
        <AppSidebar />

        {/* Mobile overlay backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-20 bg-foreground/50 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TopBar onOpenSearch={onCmdOpen ? () => onCmdOpen(true) : undefined} />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 animate-fade-in">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  )
}

export default AppLayout
