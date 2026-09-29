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
      baixas: {
        Row: {
          baixado_em: string
          banco: string | null
          created_at: string
          id: string
          item_id: string
          mes: string
          origem: string
          tipo: string
          user_id: string
          valor: number
        }
        Insert: {
          baixado_em?: string
          banco?: string | null
          created_at?: string
          id?: string
          item_id: string
          mes: string
          origem?: string
          tipo: string
          user_id?: string
          valor?: number
        }
        Update: {
          baixado_em?: string
          banco?: string | null
          created_at?: string
          id?: string
          item_id?: string
          mes?: string
          origem?: string
          tipo?: string
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      bens: {
        Row: {
          created_at: string
          destino: string | null
          id: string
          nome: string
          origem: string
          tipo: string | null
          user_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          destino?: string | null
          id?: string
          nome: string
          origem?: string
          tipo?: string | null
          user_id?: string
          valor?: number
        }
        Update: {
          created_at?: string
          destino?: string | null
          id?: string
          nome?: string
          origem?: string
          tipo?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      carteira: {
        Row: {
          classe: string
          created_at: string
          data_aplicacao: string | null
          id: string
          instituicao: string | null
          nome: string
          origem: string
          quantidade: number
          subcategoria: string
          unidade: string | null
          user_id: string
          valor_atual: number
          valor_investido: number
        }
        Insert: {
          classe?: string
          created_at?: string
          data_aplicacao?: string | null
          id?: string
          instituicao?: string | null
          nome: string
          origem?: string
          quantidade?: number
          subcategoria?: string
          unidade?: string | null
          user_id?: string
          valor_atual?: number
          valor_investido?: number
        }
        Update: {
          classe?: string
          created_at?: string
          data_aplicacao?: string | null
          id?: string
          instituicao?: string | null
          nome?: string
          origem?: string
          quantidade?: number
          subcategoria?: string
          unidade?: string | null
          user_id?: string
          valor_atual?: number
          valor_investido?: number
        }
        Relationships: []
      }
      config: {
        Row: {
          anos_projecao: number
          base_data: string | null
          dre_map: Json
          incluir_restante: boolean
          indice_padrao_entradas: number
          indice_padrao_saidas: number
          reajuste_mes: number
          regras_categoria: Json
          regras_item: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          anos_projecao?: number
          base_data?: string | null
          dre_map?: Json
          incluir_restante?: boolean
          indice_padrao_entradas?: number
          indice_padrao_saidas?: number
          reajuste_mes?: number
          regras_categoria?: Json
          regras_item?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          anos_projecao?: number
          base_data?: string | null
          dre_map?: Json
          incluir_restante?: boolean
          indice_padrao_entradas?: number
          indice_padrao_saidas?: number
          reajuste_mes?: number
          regras_categoria?: Json
          regras_item?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dividas: {
        Row: {
          created_at: string
          credor: string | null
          destino: string | null
          id: string
          juros: number
          nome: string
          origem: string
          parcela_fixa: number
          saida_id: string | null
          saldo: number
          tipo: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          credor?: string | null
          destino?: string | null
          id?: string
          juros?: number
          nome: string
          origem?: string
          parcela_fixa?: number
          saida_id?: string | null
          saldo?: number
          tipo?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          credor?: string | null
          destino?: string | null
          id?: string
          juros?: number
          nome?: string
          origem?: string
          parcela_fixa?: number
          saida_id?: string | null
          saldo?: number
          tipo?: string | null
          user_id?: string
        }
        Relationships: []
      }
      entradas: {
        Row: {
          ativo: boolean
          banco: string | null
          carteira: string | null
          codigo: string | null
          created_at: string
          dia: number | null
          empresa: string
          fim: string | null
          grupo: string | null
          id: string
          inicio: string | null
          origem: string
          regime: string | null
          setor: string | null
          user_id: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          banco?: string | null
          carteira?: string | null
          codigo?: string | null
          created_at?: string
          dia?: number | null
          empresa: string
          fim?: string | null
          grupo?: string | null
          id?: string
          inicio?: string | null
          origem?: string
          regime?: string | null
          setor?: string | null
          user_id?: string
          valor?: number
        }
        Update: {
          ativo?: boolean
          banco?: string | null
          carteira?: string | null
          codigo?: string | null
          created_at?: string
          dia?: number | null
          empresa?: string
          fim?: string | null
          grupo?: string | null
          id?: string
          inicio?: string | null
          origem?: string
          regime?: string | null
          setor?: string | null
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      entradas_pessoais: {
        Row: {
          banco: string | null
          created_at: string
          descricao: string
          dia: number | null
          fim: string | null
          id: string
          inicio: string | null
          origem: string
          user_id: string
          valor: number
        }
        Insert: {
          banco?: string | null
          created_at?: string
          descricao: string
          dia?: number | null
          fim?: string | null
          id?: string
          inicio?: string | null
          origem?: string
          user_id?: string
          valor?: number
        }
        Update: {
          banco?: string | null
          created_at?: string
          descricao?: string
          dia?: number | null
          fim?: string | null
          id?: string
          inicio?: string | null
          origem?: string
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      investimentos: {
        Row: {
          aporte_fixo: number
          created_at: string
          destino: string | null
          id: string
          instituicao: string | null
          nome: string
          origem: string
          saida_id: string | null
          saldo_inicial: number
          taxa: number
          tipo: string
          user_id: string
        }
        Insert: {
          aporte_fixo?: number
          created_at?: string
          destino?: string | null
          id?: string
          instituicao?: string | null
          nome: string
          origem?: string
          saida_id?: string | null
          saldo_inicial?: number
          taxa?: number
          tipo?: string
          user_id?: string
        }
        Update: {
          aporte_fixo?: number
          created_at?: string
          destino?: string | null
          id?: string
          instituicao?: string | null
          nome?: string
          origem?: string
          saida_id?: string | null
          saldo_inicial?: number
          taxa?: number
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      saidas: {
        Row: {
          banco: string | null
          categoria: string | null
          created_at: string
          descricao: string
          destino: string | null
          dia: number | null
          id: string
          origem: string
          pgto: string | null
          rf: string | null
          ri: string | null
          user_id: string
          valor_fixo: number | null
          valores_mes: Json
        }
        Insert: {
          banco?: string | null
          categoria?: string | null
          created_at?: string
          descricao: string
          destino?: string | null
          dia?: number | null
          id?: string
          origem?: string
          pgto?: string | null
          rf?: string | null
          ri?: string | null
          user_id?: string
          valor_fixo?: number | null
          valores_mes?: Json
        }
        Update: {
          banco?: string | null
          categoria?: string | null
          created_at?: string
          descricao?: string
          destino?: string | null
          dia?: number | null
          id?: string
          origem?: string
          pgto?: string | null
          rf?: string | null
          ri?: string | null
          user_id?: string
          valor_fixo?: number | null
          valores_mes?: Json
        }
        Relationships: []
      }
      saldos: {
        Row: {
          atualizado_em: string
          banco: string
          created_at: string
          id: string
          origem: string
          saldo: number
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          banco: string
          created_at?: string
          id?: string
          origem?: string
          saldo?: number
          user_id?: string
        }
        Update: {
          atualizado_em?: string
          banco?: string
          created_at?: string
          id?: string
          origem?: string
          saldo?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
