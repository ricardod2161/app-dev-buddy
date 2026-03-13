// Tipos centrais do SaaS WhatsApp/Telegram Assistant

export interface Workspace {
  id: string
  name: string
  owner_user_id: string | null
  created_at: string
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: 'admin' | 'member'
  created_at: string
}

export interface UserProfile {
  id: string
  user_id: string
  name: string
  role: string
  created_at: string
  updated_at: string
}

export interface Integration {
  id: string
  workspace_id: string
  provider: 'EVOLUTION' | 'CLOUD' | 'TELEGRAM'
  api_url: string | null
  api_key_encrypted: string | null
  instance_id: string | null
  phone_number: string | null
  webhook_secret: string | null
  telegram_bot_token_encrypted: string | null
  telegram_chat_id: string | null
  is_active: boolean
  created_at: string
}

export interface WhitelistNumber {
  id: string
  workspace_id: string
  phone_e164: string
  label: string | null
  is_active: boolean
  created_at: string
}

export interface Conversation {
  id: string
  workspace_id: string
  contact_phone: string
  contact_name: string | null
  provider: 'WHATSAPP' | 'TELEGRAM'
  last_message_at: string | null
  created_at: string
}

export interface Message {
  id: string
  workspace_id: string
  conversation_id: string
  direction: 'IN' | 'OUT'
  type: 'text' | 'audio' | 'image' | 'file'
  body_text: string | null
  media_url: string | null
  provider_message_id: string | null
  timestamp: string | null
  created_at: string
}

export interface Note {
  id: string
  workspace_id: string
  source_message_id: string | null
  title: string | null
  content: string | null
  category: string | null
  tags: string[]
  project: string | null
  created_at: string
  updated_at: string
}

export interface Attachment {
  id: string
  workspace_id: string
  note_id: string | null
  type: string | null
  url: string | null
  filename: string | null
  mime: string | null
  created_at: string
}

export interface Task {
  id: string
  workspace_id: string
  title: string
  description: string | null
  status: 'todo' | 'doing' | 'done' | 'canceled'
  due_at: string | null
  priority: 'low' | 'medium' | 'high'
  tags: string[]
  project: string | null
  position: number
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface Reminder {
  id: string
  workspace_id: string
  title: string | null
  message: string
  remind_at: string
  channel: 'whatsapp' | 'telegram' | 'email'
  status: 'scheduled' | 'sent' | 'canceled' | 'error'
  target_phone: string | null
  error_message: string | null
  created_at: string
}

export interface Report {
  id: string
  workspace_id: string
  type: 'daily' | 'weekly' | 'monthly' | 'custom'
  period_start: string
  period_end: string
  content: string
  created_at: string
}

export interface WebhookLog {
  id: string
  workspace_id: string | null
  provider: string | null
  event_type: string | null
  payload_json: unknown | null
  status: 'ok' | 'error' | 'auth_error' | 'rate_limited'
  error: string | null
  created_at: string
  ai_model: string | null
  ai_action: string | null
  response_ms: number | null
}

export interface Contact {
  id: string
  workspace_id: string
  phone_e164: string
  name: string
  notes: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

export interface WorkspaceSettings {
  id: string
  workspace_id: string
  default_categories: string[]
  default_tags: string[]
  bot_response_format: 'curto' | 'medio' | 'detalhado'
  bot_name: string
  bot_personality: string | null
  timezone: string
  language: string
  tts_enabled: boolean
  tts_voice_id: string
  daily_briefing_enabled: boolean
  daily_briefing_time: string
  daily_briefing_last_sent: string | null
  created_at: string
  updated_at: string
}
