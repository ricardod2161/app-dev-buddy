import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye, EyeOff, Loader2, Hash, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
  confirmPassword: z.string(),
  workspaceName: z.string().min(2, 'Nome do workspace deve ter ao menos 2 caracteres'),
}).refine(d => d.password === d.confirmPassword, { message: 'As senhas não coincidem', path: ['confirmPassword'] })

type RegisterForm = z.infer<typeof registerSchema>

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: '', color: '' }
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  const map = [
    { score: 1, label: 'Fraca', color: 'bg-destructive' },
    { score: 2, label: 'Razoável', color: 'bg-orange-400' },
    { score: 3, label: 'Boa', color: 'bg-yellow-400' },
    { score: 4, label: 'Forte', color: 'bg-green-500' },
  ]
  return map[score - 1] ?? { score: 0, label: '', color: '' }
}

const RegisterPage: React.FC = () => {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [passwordValue, setPasswordValue] = useState('')

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) })

  const strength = getPasswordStrength(passwordValue)

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email, password: data.password,
        options: { data: { name: data.name }, emailRedirectTo: window.location.origin },
      })
      if (authError) throw authError
      if (!authData.user) throw new Error('Erro ao criar usuário')

      const userId = authData.user.id
      const { data: ws, error: wsError } = await supabase
        .from('workspaces').insert({ name: data.workspaceName, owner_user_id: userId }).select().single()
      if (wsError) throw wsError

      await supabase.from('workspace_members').insert({ workspace_id: ws.id, user_id: userId, role: 'admin' })
      await supabase.from('workspace_settings').insert({
        workspace_id: ws.id,
        default_categories: ['Trabalho', 'Pessoal', 'Ideia', 'Reunião'],
        default_tags: ['importante', 'urgente', 'revisão'],
        bot_response_format: 'medio', timezone: 'America/Sao_Paulo', language: 'pt-BR',
      })

      // Seed de dados de exemplo
      await Promise.all([
        supabase.from('notes').insert([
          {
            workspace_id: ws.id,
            title: 'Bem-vindo ao sistema!',
            content: '<p>Esta é uma nota de exemplo. Você pode criar notas via WhatsApp ou diretamente aqui. Use tags, categorias e projetos para organizar.</p>',
            category: 'Pessoal',
            tags: ['importante'],
          },
          {
            workspace_id: ws.id,
            title: 'Como usar as integrações',
            content: '<p>Configure sua integração com WhatsApp (Evolution API) ou Telegram nas configurações de integrações. Depois adicione seu número na Whitelist para começar a receber mensagens.</p>',
            category: 'Trabalho',
            tags: ['revisão'],
          },
        ]),
        supabase.from('tasks').insert([
          {
            workspace_id: ws.id,
            title: 'Configurar integração WhatsApp ou Telegram',
            description: 'Vá em Integrações e configure sua conexão com WhatsApp (Evolution API) ou Telegram Bot.',
            status: 'todo',
            priority: 'high',
          },
          {
            workspace_id: ws.id,
            title: 'Adicionar número à Whitelist',
            description: 'Acesse Whitelist e adicione os números que podem enviar comandos ao sistema.',
            status: 'todo',
            priority: 'medium',
          },
        ]),
      ])

      toast.success('Conta criada com sucesso! Bem-vindo(a)!')
      navigate('/app')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao criar conta'
      toast.error(message.includes('already registered') ? 'Este e-mail já está cadastrado' : message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-slide-up">
      <div className="flex justify-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shadow-lg">
          <Hash className="w-6 h-6 text-primary-foreground" />
        </div>
      </div>
      <Card className="shadow-lg border-border">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Criar conta</CardTitle>
          <CardDescription>Preencha os dados para começar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome completo</Label>
              <Input id="name" placeholder="Seu nome" {...register('name')} aria-invalid={!!errors.name} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" placeholder="seu@email.com" {...register('email')} aria-invalid={!!errors.email} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...register('password')}
                  className="pr-10"
                  onChange={e => setPasswordValue(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword(prev => !prev)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Password strength bar */}
              {passwordValue && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(i => (
                      <div
                        key={i}
                        className={cn(
                          'h-1 flex-1 rounded-full transition-colors',
                          i <= strength.score ? strength.color : 'bg-muted'
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {strength.score === 4 && <Check className="w-3 h-3 text-green-500" />}
                    {strength.label && `Senha ${strength.label.toLowerCase()}`}
                  </p>
                </div>
              )}
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input id="confirmPassword" type="password" placeholder="••••••••" {...register('confirmPassword')} aria-invalid={!!errors.confirmPassword} />
              {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="workspaceName">Nome do workspace</Label>
              <Input id="workspaceName" placeholder="Ex: Minha Empresa" {...register('workspaceName')} aria-invalid={!!errors.workspaceName} />
              {errors.workspaceName && <p className="text-sm text-destructive">{errors.workspaceName.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar conta
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Já tem conta?{' '}
            <Link to="/auth/login" className="text-primary hover:underline font-medium">Entrar</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}

export default RegisterPage
