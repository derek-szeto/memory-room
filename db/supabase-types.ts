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
      workspace_members: {
        Row: {
          last_seen: number
          name: string
          room_id: string
          user_id: string
        }
        Insert: {
          last_seen?: number
          name: string
          room_id: string
          user_id: string
        }
        Update: {
          last_seen?: number
          name?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "workspace_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_profiles: {
        Row: {
          avatar_path: string
          color: string
          id: string
          name: string
        }
        Insert: {
          avatar_path?: string
          color?: string
          id: string
          name: string
        }
        Update: {
          avatar_path?: string
          color?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      workspace_rooms: {
        Row: {
          created_at: number
          description: string
          icon_path: string
          id: string
          invite: string
          layout: string
          metadata_version: number
          name: string
          order_version: number
          owner_id: string
          section_order: string[]
        }
        Insert: {
          created_at?: number
          description?: string
          icon_path?: string
          id?: string
          invite?: string
          layout?: string
          metadata_version?: number
          name: string
          order_version?: number
          owner_id: string
          section_order?: string[]
        }
        Update: {
          created_at?: number
          description?: string
          icon_path?: string
          id?: string
          invite?: string
          layout?: string
          metadata_version?: number
          name?: string
          order_version?: number
          owner_id?: string
          section_order?: string[]
        }
        Relationships: []
      }
      workspace_sections: {
        Row: {
          author: string
          body: string
          created_at: number
          editor: string
          id: string
          kind: string
          memory_date: string
          pinned: number
          room_id: string
          title: string
          updated_at: number
          version: number
        }
        Insert: {
          author: string
          body?: string
          created_at?: number
          editor: string
          id?: string
          kind?: string
          memory_date?: string
          pinned?: number
          room_id: string
          title: string
          updated_at?: number
          version?: number
        }
        Update: {
          author?: string
          body?: string
          created_at?: number
          editor?: string
          id?: string
          kind?: string
          memory_date?: string
          pinned?: number
          room_id?: string
          title?: string
          updated_at?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workspace_sections_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "workspace_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      workspace_action: { Args: { input: Json }; Returns: Json }
      workspace_profile: { Args: never; Returns: Json }
      workspace_rooms: { Args: never; Returns: Json }
      workspace_snapshot: { Args: { target: string }; Returns: Json }
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

