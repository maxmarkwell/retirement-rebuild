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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_recommendations: {
        Row: {
          ai_run_id: string
          bear_case: string | null
          bull_case: string | null
          created_at: string
          decision: Database["public"]["Enums"]["recommendation_decision"]
          exit_conditions: string | null
          expected_holding_period: string | null
          full_reasoning: Json | null
          fundamental_score: number | null
          id: string
          invalidation_conditions: string | null
          investment_thesis: string | null
          market_price: number
          model_name: string
          model_provider: string
          model_version: string | null
          portfolio_fit_score: number | null
          portfolio_id: string | null
          primary_risk: string | null
          prompt_version: string | null
          recommended_at: string
          risk: Database["public"]["Enums"]["risk_level"]
          suggested_allocation_pct: number | null
          technical_score: number | null
          ticker: string
          user_id: string
        }
        Insert: {
          ai_run_id: string
          bear_case?: string | null
          bull_case?: string | null
          created_at?: string
          decision: Database["public"]["Enums"]["recommendation_decision"]
          exit_conditions?: string | null
          expected_holding_period?: string | null
          full_reasoning?: Json | null
          fundamental_score?: number | null
          id?: string
          invalidation_conditions?: string | null
          investment_thesis?: string | null
          market_price: number
          model_name: string
          model_provider: string
          model_version?: string | null
          portfolio_fit_score?: number | null
          portfolio_id?: string | null
          primary_risk?: string | null
          prompt_version?: string | null
          recommended_at?: string
          risk: Database["public"]["Enums"]["risk_level"]
          suggested_allocation_pct?: number | null
          technical_score?: number | null
          ticker: string
          user_id: string
        }
        Update: {
          ai_run_id?: string
          bear_case?: string | null
          bull_case?: string | null
          created_at?: string
          decision?: Database["public"]["Enums"]["recommendation_decision"]
          exit_conditions?: string | null
          expected_holding_period?: string | null
          full_reasoning?: Json | null
          fundamental_score?: number | null
          id?: string
          invalidation_conditions?: string | null
          investment_thesis?: string | null
          market_price?: number
          model_name?: string
          model_provider?: string
          model_version?: string | null
          portfolio_fit_score?: number | null
          portfolio_id?: string | null
          primary_risk?: string | null
          prompt_version?: string | null
          recommended_at?: string
          risk?: Database["public"]["Enums"]["risk_level"]
          suggested_allocation_pct?: number | null
          technical_score?: number | null
          ticker?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_recommendations_ai_run_id_fkey"
            columns: ["ai_run_id"]
            isOneToOne: false
            referencedRelation: "ai_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_recommendations_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_runs: {
        Row: {
          committee_output: Json | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          input_snapshot: Json | null
          model_name: string
          model_provider: string
          model_version: string | null
          prompt_version: string | null
          started_at: string
          status: Database["public"]["Enums"]["ai_run_status"]
          ticker: string
          user_id: string
        }
        Insert: {
          committee_output?: Json | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_snapshot?: Json | null
          model_name: string
          model_provider: string
          model_version?: string | null
          prompt_version?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["ai_run_status"]
          ticker: string
          user_id: string
        }
        Update: {
          committee_output?: Json | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_snapshot?: Json | null
          model_name?: string
          model_provider?: string
          model_version?: string | null
          prompt_version?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["ai_run_status"]
          ticker?: string
          user_id?: string
        }
        Relationships: []
      }
      app_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          expense_date: string
          id: string
          notes: string | null
          provider: string
          user_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          expense_date: string
          id?: string
          notes?: string | null
          provider: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          expense_date?: string
          id?: string
          notes?: string | null
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
      benchmarks: {
        Row: {
          active_from: string
          active_to: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          reason_selected: string | null
          ticker: string
          user_id: string
        }
        Insert: {
          active_from: string
          active_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          reason_selected?: string | null
          ticker: string
          user_id: string
        }
        Update: {
          active_from?: string
          active_to?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          reason_selected?: string | null
          ticker?: string
          user_id?: string
        }
        Relationships: []
      }
      contributions: {
        Row: {
          amount: number
          contribution_date: string
          created_at: string
          id: string
          notes: string | null
          portfolio_id: string
          user_id: string
        }
        Insert: {
          amount: number
          contribution_date: string
          created_at?: string
          id?: string
          notes?: string | null
          portfolio_id: string
          user_id: string
        }
        Update: {
          amount?: number
          contribution_date?: string
          created_at?: string
          id?: string
          notes?: string | null
          portfolio_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contributions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      holdings: {
        Row: {
          average_cost: number
          id: string
          portfolio_id: string
          quantity: number
          ticker: string
          updated_at: string
          user_id: string
        }
        Insert: {
          average_cost?: number
          id?: string
          portfolio_id: string
          quantity?: number
          ticker: string
          updated_at?: string
          user_id: string
        }
        Update: {
          average_cost?: number
          id?: string
          portfolio_id?: string
          quantity?: number
          ticker?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      market_prices: {
        Row: {
          adjusted_close: number | null
          close: number
          created_at: string
          data_source: string
          high: number | null
          id: number
          low: number | null
          open: number | null
          price_date: string
          ticker: string
          volume: number | null
        }
        Insert: {
          adjusted_close?: number | null
          close: number
          created_at?: string
          data_source: string
          high?: number | null
          id?: never
          low?: number | null
          open?: number | null
          price_date: string
          ticker: string
          volume?: number | null
        }
        Update: {
          adjusted_close?: number | null
          close?: number
          created_at?: string
          data_source?: string
          high?: number | null
          id?: never
          low?: number | null
          open?: number | null
          price_date?: string
          ticker?: string
          volume?: number | null
        }
        Relationships: []
      }
      paper_trades: {
        Row: {
          action: Database["public"]["Enums"]["transaction_type"]
          created_at: string
          executed_at: string
          execution_price: number
          id: string
          notes: string | null
          portfolio_id: string
          quantity: number
          recommendation_id: string | null
          ticker: string
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["transaction_type"]
          created_at?: string
          executed_at: string
          execution_price: number
          id?: string
          notes?: string | null
          portfolio_id: string
          quantity: number
          recommendation_id?: string | null
          ticker: string
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["transaction_type"]
          created_at?: string
          executed_at?: string
          execution_price?: number
          id?: string
          notes?: string | null
          portfolio_id?: string
          quantity?: number
          recommendation_id?: string | null
          ticker?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_trades_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_trades_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "ai_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_snapshots: {
        Row: {
          cash_value: number
          created_at: string
          cumulative_contributions: number
          cumulative_withdrawals: number
          holdings_value: number
          id: string
          investment_growth: number
          portfolio_id: string
          snapshot_date: string
          total_value: number
          user_id: string
        }
        Insert: {
          cash_value?: number
          created_at?: string
          cumulative_contributions?: number
          cumulative_withdrawals?: number
          holdings_value?: number
          id?: string
          investment_growth?: number
          portfolio_id: string
          snapshot_date: string
          total_value?: number
          user_id: string
        }
        Update: {
          cash_value?: number
          created_at?: string
          cumulative_contributions?: number
          cumulative_withdrawals?: number
          holdings_value?: number
          id?: string
          investment_growth?: number
          portfolio_id?: string
          snapshot_date?: string
          total_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_snapshots_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_real_money: boolean
          name: string
          starting_capital: number
          type: Database["public"]["Enums"]["portfolio_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_real_money?: boolean
          name: string
          starting_capital?: number
          type: Database["public"]["Enums"]["portfolio_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_real_money?: boolean
          name?: string
          starting_capital?: number
          type?: Database["public"]["Enums"]["portfolio_type"]
          user_id?: string
        }
        Relationships: []
      }
      stock_candidates: {
        Row: {
          company_name: string | null
          created_at: string
          id: string
          notes: string | null
          source: string | null
          status: string
          ticker: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          source?: string | null
          status?: string
          ticker: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          source?: string | null
          status?: string
          ticker?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          created_at: string
          fees: number
          gross_amount: number | null
          id: string
          notes: string | null
          portfolio_id: string
          price_per_share: number | null
          quantity: number | null
          ticker: string | null
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          fees?: number
          gross_amount?: number | null
          id?: string
          notes?: string | null
          portfolio_id: string
          price_per_share?: number | null
          quantity?: number | null
          ticker?: string | null
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          fees?: number
          gross_amount?: number | null
          id?: string
          notes?: string | null
          portfolio_id?: string
          price_per_share?: number | null
          quantity?: number | null
          ticker?: string | null
          transaction_date?: string
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      ai_run_status: "started" | "completed" | "failed"
      portfolio_type: "real" | "paper_active" | "paper_long_term" | "benchmark"
      recommendation_decision:
        | "consider"
        | "wait"
        | "avoid"
        | "hold"
        | "reduce"
        | "exit"
      risk_level: "low" | "medium" | "high" | "speculative"
      transaction_type:
        | "buy"
        | "sell"
        | "deposit"
        | "withdrawal"
        | "dividend"
        | "interest"
        | "fee"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_run_status: ["started", "completed", "failed"],
      portfolio_type: ["real", "paper_active", "paper_long_term", "benchmark"],
      recommendation_decision: [
        "consider",
        "wait",
        "avoid",
        "hold",
        "reduce",
        "exit",
      ],
      risk_level: ["low", "medium", "high", "speculative"],
      transaction_type: [
        "buy",
        "sell",
        "deposit",
        "withdrawal",
        "dividend",
        "interest",
        "fee",
      ],
    },
  },
} as const
