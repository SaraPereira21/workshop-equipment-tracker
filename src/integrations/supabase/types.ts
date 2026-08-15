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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_assets: {
        Row: {
          data: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_equipment_types: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      app_inspections: {
        Row: {
          data: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_mechanics: {
        Row: {
          data: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_signatures: {
        Row: {
          data: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_tags: {
        Row: {
          id: string
          updated_at: string
        }
        Insert: {
          id: string
          updated_at?: string
        }
        Update: {
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_work_orders: {
        Row: {
          data: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          assunto: string | null
          created_at: string
          destinatarios: string[]
          evento: string
          id: string
          payload: Json | null
          prefixo: string | null
          response: string | null
          sent_by: string | null
          status: string
        }
        Insert: {
          assunto?: string | null
          created_at?: string
          destinatarios?: string[]
          evento: string
          id?: string
          payload?: Json | null
          prefixo?: string | null
          response?: string | null
          sent_by?: string | null
          status: string
        }
        Update: {
          assunto?: string | null
          created_at?: string
          destinatarios?: string[]
          evento?: string
          id?: string
          payload?: Json | null
          prefixo?: string | null
          response?: string | null
          sent_by?: string | null
          status?: string
        }
        Relationships: []
      }
      email_recipients: {
        Row: {
          ativo: boolean
          contrato: string | null
          created_at: string
          email: string
          id: string
          nome: string
          perfil: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          contrato?: string | null
          created_at?: string
          email: string
          id?: string
          nome: string
          perfil?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          contrato?: string | null
          created_at?: string
          email?: string
          id?: string
          nome?: string
          perfil?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fleet_assets: {
        Row: {
          ativo: boolean
          codigo_armac: string
          created_at: string
          created_by: string | null
          fonte: string
          id: string
          marca: string | null
          modelo: string
          numero_inventario: string | null
          numero_serie: string | null
          tipo_objeto: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo_armac: string
          created_at?: string
          created_by?: string | null
          fonte?: string
          id?: string
          marca?: string | null
          modelo?: string
          numero_inventario?: string | null
          numero_serie?: string | null
          tipo_objeto?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo_armac?: string
          created_at?: string
          created_by?: string | null
          fonte?: string
          id?: string
          marca?: string | null
          modelo?: string
          numero_inventario?: string | null
          numero_serie?: string | null
          tipo_objeto?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      kanban_columns: {
        Row: {
          chave: string
          cor: string | null
          created_at: string
          id: string
          ordem: number
          titulo: string
          titulo_curto: string
          updated_at: string
        }
        Insert: {
          chave: string
          cor?: string | null
          created_at?: string
          id?: string
          ordem?: number
          titulo: string
          titulo_curto: string
          updated_at?: string
        }
        Update: {
          chave?: string
          cor?: string | null
          created_at?: string
          id?: string
          ordem?: number
          titulo?: string
          titulo_curto?: string
          updated_at?: string
        }
        Relationships: []
      }
      pmp_operations: {
        Row: {
          created_at: string
          id: string
          item: string | null
          material: string | null
          material_codigo: string | null
          ordem: number
          plan_id: string
          procedimento: string
          qtde: number | null
          servico: string | null
          tempo: string | null
          unidade: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item?: string | null
          material?: string | null
          material_codigo?: string | null
          ordem?: number
          plan_id: string
          procedimento: string
          qtde?: number | null
          servico?: string | null
          tempo?: string | null
          unidade?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item?: string | null
          material?: string | null
          material_codigo?: string | null
          ordem?: number
          plan_id?: string
          procedimento?: string
          qtde?: number | null
          servico?: string | null
          tempo?: string | null
          unidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pmp_operations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "pmp_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      pmp_plans: {
        Row: {
          codigo_plano: string | null
          created_at: string
          criado_por: string | null
          fabricante: string | null
          familia: string | null
          id: string
          intervalo_horas: number
          intervalo_label: string
          modelo: string
          modelo_original: string
          origem_arquivo: string | null
          setor_executante: string | null
          updated_at: string
        }
        Insert: {
          codigo_plano?: string | null
          created_at?: string
          criado_por?: string | null
          fabricante?: string | null
          familia?: string | null
          id?: string
          intervalo_horas: number
          intervalo_label: string
          modelo: string
          modelo_original: string
          origem_arquivo?: string | null
          setor_executante?: string | null
          updated_at?: string
        }
        Update: {
          codigo_plano?: string | null
          created_at?: string
          criado_por?: string | null
          fabricante?: string | null
          familia?: string | null
          id?: string
          intervalo_horas?: number
          intervalo_label?: string
          modelo?: string
          modelo_original?: string
          origem_arquivo?: string | null
          setor_executante?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          assinatura_url: string | null
          ativo: boolean
          cargo: string | null
          cpf: string | null
          created_at: string
          email: string | null
          especialidade: string | null
          id: string
          must_change_password: boolean
          nome: string
          telefone: string | null
          turno: string | null
          updated_at: string
        }
        Insert: {
          assinatura_url?: string | null
          ativo?: boolean
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          especialidade?: string | null
          id: string
          must_change_password?: boolean
          nome?: string
          telefone?: string | null
          turno?: string | null
          updated_at?: string
        }
        Update: {
          assinatura_url?: string | null
          ativo?: boolean
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          especialidade?: string | null
          id?: string
          must_change_password?: boolean
          nome?: string
          telefone?: string | null
          turno?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sap_materials: {
        Row: {
          codigo: string
          descricao: string
          estoque: number
          updated_at: string
        }
        Insert: {
          codigo: string
          descricao: string
          estoque?: number
          updated_at?: string
        }
        Update: {
          codigo?: string
          descricao?: string
          estoque?: number
          updated_at?: string
        }
        Relationships: []
      }
      seminovos_items: {
        Row: {
          ano: string | null
          created_at: string
          data_liberacao_venda: string | null
          familia: string | null
          id: string
          importado_em: string
          importado_por: string | null
          localizacao: string | null
          modelo: string | null
          obs: string | null
          origem_arquivo: string | null
          preco_venda: number | null
          prefixo: string
          prefixo_norm: string
          serie: string | null
          status_manutencao: string | null
          status_sn: string | null
          updated_at: string
        }
        Insert: {
          ano?: string | null
          created_at?: string
          data_liberacao_venda?: string | null
          familia?: string | null
          id?: string
          importado_em?: string
          importado_por?: string | null
          localizacao?: string | null
          modelo?: string | null
          obs?: string | null
          origem_arquivo?: string | null
          preco_venda?: number | null
          prefixo: string
          prefixo_norm: string
          serie?: string | null
          status_manutencao?: string | null
          status_sn?: string | null
          updated_at?: string
        }
        Update: {
          ano?: string | null
          created_at?: string
          data_liberacao_venda?: string | null
          familia?: string | null
          id?: string
          importado_em?: string
          importado_por?: string | null
          localizacao?: string | null
          modelo?: string | null
          obs?: string | null
          origem_arquivo?: string | null
          preco_venda?: number | null
          prefixo?: string
          prefixo_norm?: string
          serie?: string | null
          status_manutencao?: string | null
          status_sn?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      seminovos_meta: {
        Row: {
          mes: string
          updated_at: string
          valor: number
        }
        Insert: {
          mes: string
          updated_at?: string
          valor?: number
        }
        Update: {
          mes?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      seminovos_prioridade: {
        Row: {
          ordem: number
          prefixo_norm: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ordem?: number
          prefixo_norm: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ordem?: number
          prefixo_norm?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_ids_by_roles: {
        Args: { _roles: string[] }
        Returns: {
          role: string
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "pcm"
        | "supervisor"
        | "frota"
        | "inspetor"
        | "mecanico"
        | "visitante"
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
    Enums: {
      app_role: [
        "admin",
        "pcm",
        "supervisor",
        "frota",
        "inspetor",
        "mecanico",
        "visitante",
      ],
    },
  },
} as const
