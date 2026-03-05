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
      if (wsData) setWorkspace(wsData as Workspace)
    }
  }

  const refreshWorkspace = async () => {
    if (user) await loadWorkspace(user.id)
  }

  useEffect(() => {
    // Configurar listener ANTES de getSession
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession)
        setUser(newSession?.user ?? null)

        if (newSession?.user) {
          await loadProfile(newSession.user.id)
          await loadWorkspace(newSession.user.id)
        } else {
          setProfile(null)
          setWorkspace(null)
        }
        setLoading(false)
      }
    )

    // Carregar sessão existente
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (existingSession) {
        setSession(existingSession)
        setUser(existingSession.user)
        loadProfile(existingSession.user.id)
        loadWorkspace(existingSession.user.id)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
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
