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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          created_at: string
          details: string
          id: string
          target_id: string | null
          target_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          details?: string
          id?: string
          target_id?: string | null
          target_name?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          details?: string
          id?: string
          target_id?: string | null
          target_name?: string
        }
        Relationships: []
      }
      bans: {
        Row: {
          banned_by: string | null
          created_at: string
          expires_at: string | null
          kind: string
          reason: string
          user_id: string
        }
        Insert: {
          banned_by?: string | null
          created_at?: string
          expires_at?: string | null
          kind?: string
          reason?: string
          user_id: string
        }
        Update: {
          banned_by?: string | null
          created_at?: string
          expires_at?: string | null
          kind?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      login_events: {
        Row: {
          browser: string
          created_at: string
          device: string
          id: string
          ip: string
          os: string
          user_agent: string
          user_id: string
        }
        Insert: {
          browser?: string
          created_at?: string
          device?: string
          id?: string
          ip?: string
          os?: string
          user_agent?: string
          user_id: string
        }
        Update: {
          browser?: string
          created_at?: string
          device?: string
          id?: string
          ip?: string
          os?: string
          user_agent?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mic_seats: {
        Row: {
          force_muted: boolean
          last_seen: string | null
          muted: boolean
          room_id: string
          seat: number
          user_id: string | null
        }
        Insert: {
          force_muted?: boolean
          last_seen?: string | null
          muted?: boolean
          room_id: string
          seat: number
          user_id?: string | null
        }
        Update: {
          force_muted?: boolean
          last_seen?: string | null
          muted?: boolean
          room_id?: string
          seat?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mic_seats_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mic_seats_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      private_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
          sender_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_messages_sender_fk"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_likes: {
        Row: {
          created_at: string
          liker_id: string
          target_id: string
        }
        Insert: {
          created_at?: string
          liker_id: string
          target_id: string
        }
        Update: {
          created_at?: string
          liker_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_likes_liker_id_fkey"
            columns: ["liker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_likes_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          color: string
          created_at: string
          id: string
          is_guest: boolean
          likes_count: number
          status: string
          username: string
        }
        Insert: {
          avatar_path?: string | null
          color?: string
          created_at?: string
          id: string
          is_guest?: boolean
          likes_count?: number
          status?: string
          username: string
        }
        Update: {
          avatar_path?: string | null
          color?: string
          created_at?: string
          id?: string
          is_guest?: boolean
          likes_count?: number
          status?: string
          username?: string
        }
        Relationships: []
      }
      ranks: {
        Row: {
          color: string
          created_at: string
          icon: string
          id: string
          is_owner: boolean
          level: number
          name: string
          permissions: string[]
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_owner?: boolean
          level: number
          name: string
          permissions?: string[]
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_owner?: boolean
          level?: number
          name?: string
          permissions?: string[]
        }
        Relationships: []
      }
      room_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          room_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          room_id: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_messages_user_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          announcement: string
          guests_enabled: boolean
          id: boolean
          signups_enabled: boolean
          updated_at: string
        }
        Insert: {
          announcement?: string
          guests_enabled?: boolean
          id?: boolean
          signups_enabled?: boolean
          updated_at?: string
        }
        Update: {
          announcement?: string
          guests_enabled?: boolean
          id?: boolean
          signups_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      user_ranks: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          expires_at: string | null
          rank_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          expires_at?: string | null
          rank_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          expires_at?: string | null
          rank_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ranks_rank_id_fkey"
            columns: ["rank_id"]
            isOneToOne: false
            referencedRelation: "ranks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_ranks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_ban: {
        Args: {
          _kind: string
          _minutes: number
          _reason: string
          _user: string
        }
        Returns: undefined
      }
      admin_clear_avatar: { Args: { _user: string }; Returns: undefined }
      admin_clear_room: { Args: { _room: string }; Returns: number }
      admin_delete_message: { Args: { _id: string }; Returns: undefined }
      admin_delete_rank: { Args: { _id: string }; Returns: undefined }
      admin_delete_room: { Args: { _room: string }; Returns: undefined }
      admin_mic_kick: {
        Args: { _room: string; _seat: number }
        Returns: undefined
      }
      admin_mic_mute: {
        Args: { _muted: boolean; _room: string; _seat: number }
        Returns: undefined
      }
      admin_rename_user: {
        Args: { _name: string; _user: string }
        Returns: undefined
      }
      admin_save_rank: {
        Args: {
          _color: string
          _icon: string
          _id: string
          _level: number
          _name: string
          _permissions: string[]
        }
        Returns: string
      }
      admin_set_likes: {
        Args: { _count: number; _user: string }
        Returns: undefined
      }
      admin_set_user_rank: {
        Args: { _days: number; _rank: string; _user: string }
        Returns: undefined
      }
      admin_unban: {
        Args: { _kind: string; _user: string }
        Returns: undefined
      }
      admin_update_room: {
        Args: { _description: string; _name: string; _room: string }
        Returns: undefined
      }
      admin_update_settings: {
        Args: { _announcement: string; _guests: boolean; _signups: boolean }
        Returns: undefined
      }
      can_act_on: { Args: { _perm: string; _target: string }; Returns: boolean }
      can_manage_user: {
        Args: { _actor: string; _target: string }
        Returns: boolean
      }
      can_post: { Args: never; Returns: boolean }
      has_permission: {
        Args: { _perm: string; _uid: string }
        Returns: boolean
      }
      is_banned: { Args: { _uid: string }; Returns: boolean }
      is_chat_member: { Args: never; Returns: boolean }
      is_silenced: { Args: { _uid: string }; Returns: boolean }
      leave_mic: { Args: { _room: string }; Returns: undefined }
      log_admin: {
        Args: { _action: string; _details: string; _target: string }
        Returns: undefined
      }
      mic_heartbeat: {
        Args: { _muted: boolean; _room: string }
        Returns: boolean
      }
      rank_level: { Args: { _uid: string }; Returns: number }
      take_mic: { Args: { _room: string; _seat: number }; Returns: boolean }
      toggle_like: { Args: { _target: string }; Returns: number }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
