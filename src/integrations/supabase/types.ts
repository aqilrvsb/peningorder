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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      bundles: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          price_normal: number
          price_shopee: number
          price_tiktok: number
          product_id: string | null
          units: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price_normal?: number
          price_shopee?: number
          price_tiktok?: number
          product_id?: string | null
          units?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price_normal?: number
          price_shopee?: number
          price_tiktok?: number
          product_id?: string | null
          units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bundles_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_orders: {
        Row: {
          alamat: string
          bandar: string
          bank: string | null
          berat_parcel: number | null
          cara_bayaran: string | null
          created_at: string
          date_order: string | null
          date_processed: string | null
          delivery_status: string | null
          harga_jualan_agen: number | null
          harga_jualan_produk: number | null
          harga_jualan_sebenar: number
          id: string
          id_sale: string | null
          jenis_bayaran: string | null
          jenis_customer: string | null
          jenis_platform: string | null
          kos_pos: number | null
          kos_produk: number | null
          kuantiti: number
          kurier: string | null
          marketer_id: string | null
          marketer_id_staff: string
          marketer_name: string
          negeri: string
          no_phone: string
          no_tempahan: string
          no_tracking: string | null
          nota_staff: string | null
          poskod: string
          produk: string
          profit: number | null
          receipt_image_url: string | null
          sku: string
          status_parcel: string | null
          tarikh_bayaran: string | null
          tarikh_tempahan: string
          updated_at: string
          waybill_url: string | null
        }
        Insert: {
          alamat: string
          bandar: string
          bank?: string | null
          berat_parcel?: number | null
          cara_bayaran?: string | null
          created_at?: string
          date_order?: string | null
          date_processed?: string | null
          delivery_status?: string | null
          harga_jualan_agen?: number | null
          harga_jualan_produk?: number | null
          harga_jualan_sebenar: number
          id?: string
          id_sale?: string | null
          jenis_bayaran?: string | null
          jenis_customer?: string | null
          jenis_platform?: string | null
          kos_pos?: number | null
          kos_produk?: number | null
          kuantiti?: number
          kurier?: string | null
          marketer_id?: string | null
          marketer_id_staff: string
          marketer_name: string
          negeri: string
          no_phone: string
          no_tempahan: string
          no_tracking?: string | null
          nota_staff?: string | null
          poskod: string
          produk: string
          profit?: number | null
          receipt_image_url?: string | null
          sku: string
          status_parcel?: string | null
          tarikh_bayaran?: string | null
          tarikh_tempahan: string
          updated_at?: string
          waybill_url?: string | null
        }
        Update: {
          alamat?: string
          bandar?: string
          bank?: string | null
          berat_parcel?: number | null
          cara_bayaran?: string | null
          created_at?: string
          date_order?: string | null
          date_processed?: string | null
          delivery_status?: string | null
          harga_jualan_agen?: number | null
          harga_jualan_produk?: number | null
          harga_jualan_sebenar?: number
          id?: string
          id_sale?: string | null
          jenis_bayaran?: string | null
          jenis_customer?: string | null
          jenis_platform?: string | null
          kos_pos?: number | null
          kos_produk?: number | null
          kuantiti?: number
          kurier?: string | null
          marketer_id?: string | null
          marketer_id_staff?: string
          marketer_name?: string
          negeri?: string
          no_phone?: string
          no_tempahan?: string
          no_tracking?: string | null
          nota_staff?: string | null
          poskod?: string
          produk?: string
          profit?: number | null
          receipt_image_url?: string | null
          sku?: string
          status_parcel?: string | null
          tarikh_bayaran?: string | null
          tarikh_tempahan?: string
          updated_at?: string
          waybill_url?: string | null
        }
        Relationships: []
      }
      invoice_settings: {
        Row: {
          id: string
          company_name: string
          registration_no: string | null
          address: string | null
          phone: string | null
          email: string | null
          website: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_name: string
          registration_no?: string | null
          address?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_name?: string
          registration_no?: string | null
          address?: string | null
          phone?: string | null
          email?: string | null
          website?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ninjavan_config: {
        Row: {
          client_id: string
          client_secret: string
          created_at: string
          id: string
          sender_address1: string
          sender_address2: string | null
          sender_city: string
          sender_email: string
          sender_name: string
          sender_phone: string
          sender_postcode: string
          sender_state: string
          updated_at: string
        }
        Insert: {
          client_id: string
          client_secret: string
          created_at?: string
          id?: string
          sender_address1: string
          sender_address2?: string | null
          sender_city: string
          sender_email: string
          sender_name: string
          sender_phone: string
          sender_postcode: string
          sender_state: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_secret?: string
          created_at?: string
          id?: string
          sender_address1?: string
          sender_address2?: string | null
          sender_city?: string
          sender_email?: string
          sender_name?: string
          sender_phone?: string
          sender_postcode?: string
          sender_state?: string
          updated_at?: string
        }
        Relationships: []
      }
      ninjavan_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          base_cost: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          quantity: number
          sku: string
          stock_in: number
          stock_out: number
          updated_at: string
        }
        Insert: {
          base_cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          quantity?: number
          sku: string
          stock_in?: number
          stock_out?: number
          updated_at?: string
        }
        Update: {
          base_cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          quantity?: number
          sku?: string
          stock_in?: number
          stock_out?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          idstaff: string | null
          is_active: boolean
          password_hash: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          idstaff?: string | null
          is_active?: boolean
          password_hash: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          idstaff?: string | null
          is_active?: boolean
          password_hash?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      prospects: {
        Row: {
          admin_id_staff: string | null
          created_at: string
          created_by: string | null
          id: string
          jenis_prospek: string
          nama_prospek: string
          niche: string
          no_telefon: string
          price_closed: number | null
          status_closed: string | null
          tarikh_phone_number: string | null
          updated_at: string
        }
        Insert: {
          admin_id_staff?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          jenis_prospek: string
          nama_prospek: string
          niche: string
          no_telefon: string
          price_closed?: number | null
          status_closed?: string | null
          tarikh_phone_number?: string | null
          updated_at?: string
        }
        Update: {
          admin_id_staff?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          jenis_prospek?: string
          nama_prospek?: string
          niche?: string
          no_telefon?: string
          price_closed?: number | null
          status_closed?: string | null
          tarikh_phone_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      spends: {
        Row: {
          created_at: string
          id: string
          jenis_platform: string
          marketer_id_staff: string | null
          product: string
          tarikh_spend: string
          total_spend: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          jenis_platform: string
          marketer_id_staff?: string | null
          product: string
          tarikh_spend?: string
          total_spend?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          jenis_platform?: string
          marketer_id_staff?: string | null
          product?: string
          tarikh_spend?: string
          total_spend?: number
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          date: string
          description: string | null
          id: string
          master_agent_id: string | null
          product_id: string
          quantity: number
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          master_agent_id?: string | null
          product_id: string
          quantity: number
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          master_agent_id?: string | null
          product_id?: string
          quantity?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
      generate_sale_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      login_user: {
        Args: {
          p_idstaff: string
          p_password: string
        }
        Returns: {
          user_id: string
          username: string
          full_name: string
          idstaff: string
          role: string
          is_active: boolean
        }[]
      }
      register_user: {
        Args: {
          p_idstaff: string
          p_password: string
          p_full_name: string
          p_role?: string
        }
        Returns: {
          user_id: string
          username: string
          full_name: string
          idstaff: string
          role: string
        }[]
      }
      verify_password: {
        Args: {
          input_password: string
          stored_hash: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "marketer" | "admin" | "bod" | "logistic" | "account"
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
      app_role: ["marketer", "admin", "bod", "logistic", "account"],
    },
  },
} as const
