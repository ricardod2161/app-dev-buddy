import React, { createContext, useContext, useEffect, useState } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import type { UserProfile, Workspace } from '@/types/database'

interface AuthContextType {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  workspace: Workspace | null
  workspaceId: string | null
  loading: boolean
  signOut: () => Promise<void>
  refreshWorkspace: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  workspace: null,
  workspaceId: null,
  loading: true,
  signOut: async () => {},
  refreshWorkspace: async () => {},
})

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()
    if (data) setProfile(data as UserProfile)
  }

  const loadWorkspace = async (userId: string) => {
    const { data: memberData } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .limit(1)
      .single()

    if (memberData?.workspace_id) {
      const { data: wsData } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', memberData.workspace_id)
        .single()
      if (wsData) {
        setWorkspace(wsData as Workspace)
        return
      }
    }

    // Auto-recovery: create workspace if user has none
    try {
      const { data: ws, error: wsErr } = await supabase
        .from('workspaces')
        .insert({ name: 'Meu Workspace', owner_user_id: userId })
        .select()
        .single()
      if (!wsErr && ws) {
        await supabase.from('workspace_members').insert({ workspace_id: ws.id, user_id: userId, role: 'admin' })
        await supabase.from('workspace_settings').insert({ workspace_id: ws.id })
        setWorkspace(ws as Workspace)
      }
    } catch {
      // silently fail — workspaceId stays null
    }
  }

  const refreshWorkspace = async () => {
    if (user) await loadWorkspace(user.id)
  }

  useEffect(() => {
    let initialized = false

    // Carregar sessão existente primeiro
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (!initialized) {
        initialized = true
        setSession(existingSession)
        setUser(existingSession?.user ?? null)

        if (existingSession?.user) {
          Promise.all([
            loadProfile(existingSession.user.id),
            loadWorkspace(existingSession.user.id),
          ]).finally(() => setLoading(false))
        } else {
          setLoading(false)
        }
      }
    }).catch(() => {
      if (!initialized) {
        initialized = true
        setLoading(false)
      }
    })

    // Listener para mudanças de autenticação (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession)
        setUser(newSession?.user ?? null)

        if (newSession?.user) {
          await Promise.all([
            loadProfile(newSession.user.id),
            loadWorkspace(newSession.user.id),
          ])
        } else {
          setProfile(null)
          setWorkspace(null)
        }

        if (!initialized) {
          initialized = true
        }
        setLoading(false)
      }
    )

    // Fallback: garantir que o loading seja removido após 5s no máximo
    const timeout = setTimeout(() => {
      if (!initialized) {
        initialized = true
        setLoading(false)
      }
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    setProfile(null)
    setWorkspace(null)
  }

  return (
    <AuthContext.Provider value={{
      session,
      user,
      profile,
      workspace,
      workspaceId: workspace?.id ?? null,
      loading,
      signOut,
      refreshWorkspace,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
