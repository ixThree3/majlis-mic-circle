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
      broadcasts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Relationships: []
      }
      device_bans: {
        Row: {
          banned_by: string | null
          created_at: string
          device_id: string
          expires_at: string | null
          reason: string
        }
        Insert: {
          banned_by?: string | null
          created_at?: string
          device_id: string
          expires_at?: string | null
          reason?: string
        }
        Update: {
          banned_by?: string | null
          created_at?: string
          device_id?: string
          expires_at?: string | null
          reason?: string
        }
        Relationships: []
      }
      flagged_messages: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          kind: string
          reason: string
          ref_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          room_id: string | null
          severity: string
          source: string
          status: string
        }
        Insert: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          kind: string
          reason?: string
          ref_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          severity?: string
          source: string
          status?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          kind?: string
          reason?: string
          ref_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          severity?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "flagged_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_bans: {
        Row: {
          banned_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          pattern: string
          reason: string
        }
        Insert: {
          banned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          pattern: string
          reason?: string
        }
        Update: {
          banned_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          pattern?: string
          reason?: string
        }
        Relationships: []
      }
      login_events: {
        Row: {
          browser: string
          created_at: string
          device: string
          device_id: string
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
          device_id?: string
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
          device_id?: string
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
          taken_at: string | null
          user_id: string | null
        }
        Insert: {
          force_muted?: boolean
          last_seen?: string | null
          muted?: boolean
          room_id: string
          seat: number
          taken_at?: string | null
          user_id?: string | null
        }
        Update: {
          force_muted?: boolean
          last_seen?: string | null
          muted?: boolean
          room_id?: string
          seat?: number
          taken_at?: string | null
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
      notifications: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          kind: string
          post_id: string | null
          read_at: string | null
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          kind: string
          post_id?: string | null
          read_at?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          kind?: string
          post_id?: string | null
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          post_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body: string
          comment_count: number
          created_at: string
          id: string
          like_count: number
          share_count: number
          shared_from: string | null
        }
        Insert: {
          author_id: string
          body?: string
          comment_count?: number
          created_at?: string
          id?: string
          like_count?: number
          share_count?: number
          shared_from?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          comment_count?: number
          created_at?: string
          id?: string
          like_count?: number
          share_count?: number
          shared_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_shared_from_fkey"
            columns: ["shared_from"]
            isOneToOne: false
            referencedRelation: "posts"
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
          font: string
          id: string
          is_guest: boolean
          last_room_id: string | null
          last_seen_at: string | null
          likes_count: number
          name_style: string
          status: string
          stealth: boolean
          streak_count: number
          streak_last_day: string | null
          username: string
        }
        Insert: {
          avatar_path?: string | null
          color?: string
          created_at?: string
          font?: string
          id: string
          is_guest?: boolean
          last_room_id?: string | null
          last_seen_at?: string | null
          likes_count?: number
          name_style?: string
          status?: string
          stealth?: boolean
          streak_count?: number
          streak_last_day?: string | null
          username: string
        }
        Update: {
          avatar_path?: string | null
          color?: string
          created_at?: string
          font?: string
          id?: string
          is_guest?: boolean
          last_room_id?: string | null
          last_seen_at?: string | null
          likes_count?: number
          name_style?: string
          status?: string
          stealth?: boolean
          streak_count?: number
          streak_last_day?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_room_id_fkey"
            columns: ["last_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
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
          locked: boolean
          mic_limit_seconds: number
          name: string
          quiet: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          locked?: boolean
          mic_limit_seconds?: number
          name: string
          quiet?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          locked?: boolean
          mic_limit_seconds?: number
          name?: string
          quiet?: boolean
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          ai_last_scan_at: string | null
          announcement: string
          block_links: boolean
          guests_enabled: boolean
          id: boolean
          signups_enabled: boolean
          updated_at: string
        }
        Insert: {
          ai_last_scan_at?: string | null
          announcement?: string
          block_links?: boolean
          guests_enabled?: boolean
          id?: boolean
          signups_enabled?: boolean
          updated_at?: string
        }
        Update: {
          ai_last_scan_at?: string | null
          announcement?: string
          block_links?: boolean
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
      word_filters: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          word: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          word: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          word?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_comment: { Args: { _body: string; _post: string }; Returns: string }
      add_post: { Args: { _body: string; _shared: string }; Returns: string }
      admin_add_filter: {
        Args: { _kind: string; _word: string }
        Returns: undefined
      }
      admin_ban: {
        Args: {
          _kind: string
          _minutes: number
          _reason: string
          _user: string
        }
        Returns: undefined
      }
      admin_ban_footprint: {
        Args: {
          _devices: boolean
          _ips: boolean
          _minutes: number
          _reason: string
          _user: string
        }
        Returns: undefined
      }
      admin_ban_ip: {
        Args: { _minutes: number; _pattern: string; _reason: string }
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
      admin_remove_filter: { Args: { _id: string }; Returns: undefined }
      admin_rename_user: {
        Args: { _name: string; _user: string }
        Returns: undefined
      }
      admin_room_controls: {
        Args: {
          _locked: boolean
          _mic_limit: number
          _quiet: boolean
          _room: string
        }
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
      admin_set_link_block: { Args: { _on: boolean }; Returns: undefined }
      admin_set_user_rank: {
        Args: { _days: number; _rank: string; _user: string }
        Returns: undefined
      }
      admin_unban: {
        Args: { _kind: string; _user: string }
        Returns: undefined
      }
      admin_unban_device: { Args: { _device: string }; Returns: undefined }
      admin_unban_ip: { Args: { _id: string }; Returns: undefined }
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
      content_verdict: { Args: { _body: string }; Returns: string }
      delete_comment: { Args: { _id: string }; Returns: undefined }
      delete_post: { Args: { _id: string }; Returns: undefined }
      enforce_network_bans: {
        Args: { _device: string; _ip: string; _user: string }
        Returns: boolean
      }
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
      purge_old_posts: { Args: never; Returns: number }
      rank_level: { Args: { _uid: string }; Returns: number }
      review_flag: {
        Args: { _id: string; _status: string }
        Returns: undefined
      }
      send_broadcast: { Args: { _body: string }; Returns: undefined }
      set_stealth: { Args: { _on: boolean }; Returns: undefined }
      take_mic: { Args: { _room: string; _seat: number }; Returns: boolean }
      toggle_like: { Args: { _target: string }; Returns: number }
      toggle_post_like: { Args: { _post: string }; Returns: number }
      touch_presence: { Args: { _room: string }; Returns: undefined }
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
