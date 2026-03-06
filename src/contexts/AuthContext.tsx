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

  const loadWorkspace = async (userId: string): Promise<boolean> => {
    // Small delay to allow DB trigger (handle_new_user) to complete on fresh signups
    await new Promise(r => setTimeout(r, 300))

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
        return true
      }
    }

    // Retry once more after 700ms (handles slow trigger execution)
    await new Promise(r => setTimeout(r, 700))
    const { data: retryMember } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .limit(1)
      .single()

    if (retryMember?.workspace_id) {
      const { data: retryWs } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', retryMember.workspace_id)
        .single()
      if (retryWs) {
        setWorkspace(retryWs as Workspace)
        return true
      }
    }

    // Auto-recovery: create workspace if user has none (last resort)
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
        // Force reload so the new workspaceId propagates cleanly to all components
        setTimeout(() => window.location.reload(), 300)
        return true
      }
    } catch {
      // silently fail — workspaceId stays null
    }

    return false
  }

  const refreshWorkspace = async () => {
    if (user) await loadWorkspace(user.id)
  }

  useEffect(() => {
    // Use getSession() first — restores from localStorage synchronously
    // This avoids the race condition where onAuthStateChange fires INITIAL_SESSION
    // before the token is available, causing auth.uid() = null in RLS policies
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
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
    }).catch(() => {
      setLoading(false)
    })

    // Listener for sign-in / sign-out events only (not INITIAL_SESSION — handled above)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        // Skip INITIAL_SESSION — already handled by getSession() above
        if (event === 'INITIAL_SESSION') return

        setSession(newSession)
        setUser(newSession?.user ?? null)

        if (newSession?.user) {
          // Do NOT await here — calling Supabase inside onAuthStateChange
          // synchronously can cause deadlocks. Use setTimeout to defer.
          setTimeout(async () => {
            await Promise.all([
              loadProfile(newSession.user.id),
              loadWorkspace(newSession.user.id),
            ])
            setLoading(false)
          }, 0)
        } else {
          setProfile(null)
          setWorkspace(null)
          setLoading(false)
        }
      }
    )

    // Safety fallback: ensure loading is removed after 8s maximum
    const timeout = setTimeout(() => setLoading(false), 8000)

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
