export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          created_at: string | null
          filename: string | null
          id: string
          mime: string | null
          note_id: string | null
          type: string | null
          url: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          filename?: string | null
          id?: string
          mime?: string | null
          note_id?: string | null
          type?: string | null
          url?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          filename?: string | null
          id?: string
          mime?: string | null
          note_id?: string | null
          type?: string | null
          url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          contact_name: string | null
          contact_phone: string
          created_at: string | null
          id: string
          last_message_at: string | null
          provider: string | null
          workspace_id: string
        }
        Insert: {
          contact_name?: string | null
          contact_phone: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          provider?: string | null
          workspace_id: string
        }
        Update: {
          contact_name?: string | null
          contact_phone?: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          provider?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          api_key_encrypted: string | null
          api_url: string | null
          created_at: string | null
          id: string
          instance_id: string | null
          is_active: boolean | null
          phone_number: string | null
          provider: string
          telegram_bot_token_encrypted: string | null
          telegram_chat_id: string | null
          webhook_secret: string | null
          workspace_id: string
        }
        Insert: {
          api_key_encrypted?: string | null
          api_url?: string | null
          created_at?: string | null
          id?: string
          instance_id?: string | null
          is_active?: boolean | null
          phone_number?: string | null
          provider: string
          telegram_bot_token_encrypted?: string | null
          telegram_chat_id?: string | null
          webhook_secret?: string | null
          workspace_id: string
        }
        Update: {
          api_key_encrypted?: string | null
          api_url?: string | null
          created_at?: string | null
          id?: string
          instance_id?: string | null
          is_active?: boolean | null
          phone_number?: string | null
          provider?: string
          telegram_bot_token_encrypted?: string | null
          telegram_chat_id?: string | null
          webhook_secret?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body_text: string | null
          conversation_id: string
          created_at: string | null
          direction: string
          id: string
          media_url: string | null
          provider_message_id: string | null
          timestamp: string | null
          type: string
          workspace_id: string
        }
        Insert: {
          body_text?: string | null
          conversation_id: string
          created_at?: string | null
          direction: string
          id?: string
          media_url?: string | null
          provider_message_id?: string | null
          timestamp?: string | null
          type?: string
          workspace_id: string
        }
        Update: {
          body_text?: string | null
          conversation_id?: string
          created_at?: string | null
          direction?: string
          id?: string
          media_url?: string | null
          provider_message_id?: string | null
          timestamp?: string | null
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          category: string | null
          content: string | null
          created_at: string | null
          id: string
          project: string | null
          source_message_id: string | null
          tags: Json | null
          title: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          project?: string | null
          source_message_id?: string | null
          tags?: Json | null
          title?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          project?: string | null
          source_message_id?: string | null
          tags?: Json | null
          title?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_webhook_events: {
        Row: {
          id: string
          processed_at: string | null
          provider_message_id: string
          workspace_id: string | null
        }
        Insert: {
          id?: string
          processed_at?: string | null
          provider_message_id: string
          workspace_id?: string | null
        }
        Update: {
          id?: string
          processed_at?: string | null
          provider_message_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          channel: string | null
          created_at: string | null
          error_message: string | null
          id: string
          message: string
          remind_at: string
          status: string | null
          target_phone: string | null
          title: string | null
          workspace_id: string
        }
        Insert: {
          channel?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          message: string
          remind_at: string
          status?: string | null
          target_phone?: string | null
          title?: string | null
          workspace_id: string
        }
        Update: {
          channel?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          message?: string
          remind_at?: string
          status?: string | null
          target_phone?: string | null
          title?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          content: string
          created_at: string | null
          id: string
          period_end: string
          period_start: string
          type: string
          workspace_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          period_end: string
          period_start: string
          type: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          period_end?: string
          period_start?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_at: string | null
          id: string
          position: number | null
          priority: string | null
          project: string | null
          status: string
          tags: Json | null
          title: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          position?: number | null
          priority?: string | null
          project?: string | null
          status?: string
          tags?: Json | null
          title: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          position?: number | null
          priority?: string | null
          project?: string | null
          status?: string
          tags?: Json | null
          title?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string | null
          id: string
          name: string
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          role?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string | null
          error: string | null
          event_type: string | null
          id: string
          payload_json: Json | null
          provider: string | null
          status: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          event_type?: string | null
          id?: string
          payload_json?: Json | null
          provider?: string | null
          status?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          error?: string | null
          event_type?: string | null
          id?: string
          payload_json?: Json | null
          provider?: string | null
          status?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      whitelist_numbers: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          label: string | null
          phone_e164: string
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          phone_e164: string
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          phone_e164?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whitelist_numbers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string | null
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_settings: {
        Row: {
          bot_name: string | null
          bot_personality: string | null
          bot_response_format: string | null
          created_at: string | null
          default_categories: Json | null
          default_tags: Json | null
          id: string
          language: string | null
          timezone: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          bot_name?: string | null
          bot_personality?: string | null
          bot_response_format?: string | null
          created_at?: string | null
          default_categories?: Json | null
          default_tags?: Json | null
          id?: string
          language?: string | null
          timezone?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          bot_name?: string | null
          bot_personality?: string | null
          bot_response_format?: string | null
          created_at?: string | null
          default_categories?: Json | null
          default_tags?: Json | null
          id?: string
          language?: string | null
          timezone?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string | null
          id: string
          name: string
          owner_user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          owner_user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          owner_user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_workspace_id: { Args: { _user_id: string }; Returns: string }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
