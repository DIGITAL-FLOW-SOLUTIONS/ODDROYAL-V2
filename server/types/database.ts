// Supabase Database Types for Betting Application
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          username: string;
          first_name: string | null;
          last_name: string | null;
          phone_number: string | null;
          date_of_birth: string | null;
          balance_cents: number;
          currency: string;
          is_verified: boolean;
          is_active: boolean;
          preferred_odds_format: string;
          marketing_consent: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          username: string;
          first_name?: string | null;
          last_name?: string | null;
          phone_number?: string | null;
          date_of_birth?: string | null;
          balance_cents?: number;
          currency?: string;
          is_verified?: boolean;
          is_active?: boolean;
          preferred_odds_format?: string;
          marketing_consent?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          username?: string;
          first_name?: string | null;
          last_name?: string | null;
          phone_number?: string | null;
          date_of_birth?: string | null;
          balance_cents?: number;
          currency?: string;
          is_verified?: boolean;
          is_active?: boolean;
          preferred_odds_format?: string;
          marketing_consent?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      bets: {
        Row: {
          id: string;
          user_id: string;
          bet_type: string;
          total_stake_cents: number;
          potential_winnings_cents: number;
          actual_winnings_cents: number | null;
          status: string;
          placed_at: string;
          settled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          bet_type: string;
          total_stake_cents: number;
          potential_winnings_cents: number;
          actual_winnings_cents?: number | null;
          status?: string;
          placed_at?: string;
          settled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          bet_type?: string;
          total_stake_cents?: number;
          potential_winnings_cents?: number;
          actual_winnings_cents?: number | null;
          status?: string;
          placed_at?: string;
          settled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      bet_selections: {
        Row: {
          id: string;
          bet_id: string;
          fixture_id: string;
          home_team: string;
          away_team: string;
          league: string;
          market: string;
          selection: string;
          odds: string;
          status: string;
          result: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          bet_id: string;
          fixture_id: string;
          home_team: string;
          away_team: string;
          league: string;
          market: string;
          selection: string;
          odds: string;
          status?: string;
          result?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          bet_id?: string;
          fixture_id?: string;
          home_team?: string;
          away_team?: string;
          league?: string;
          market?: string;
          selection?: string;
          odds?: string;
          status?: string;
          result?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          amount_cents: number;
          description: string;
          reference_type: string | null;
          reference_id: string | null;
          balance_after_cents: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          amount_cents: number;
          description: string;
          reference_type?: string | null;
          reference_id?: string | null;
          balance_after_cents: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          amount_cents?: number;
          description?: string;
          reference_type?: string | null;
          reference_id?: string | null;
          balance_after_cents?: number;
          created_at?: string;
        };
      };
      user_favorites: {
        Row: {
          id: string;
          user_id: string;
          entity_type: string;
          entity_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          entity_type: string;
          entity_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          entity_type?: string;
          entity_id?: string;
          created_at?: string;
        };
      };
      admin_users: {
        Row: {
          id: string;
          username: string;
          email: string;
          password_hash: string;
          first_name: string | null;
          last_name: string | null;
          role: string;
          is_active: boolean;
          last_login_at: string | null;
          failed_login_attempts: number;
          locked_until: string | null;
          totp_secret: string | null;
          is_2fa_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          username: string;
          email: string;
          password_hash: string;
          first_name?: string | null;
          last_name?: string | null;
          role?: string;
          is_active?: boolean;
          last_login_at?: string | null;
          failed_login_attempts?: number;
          locked_until?: string | null;
          totp_secret?: string | null;
          is_2fa_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          email?: string;
          password_hash?: string;
          first_name?: string | null;
          last_name?: string | null;
          role?: string;
          is_active?: boolean;
          last_login_at?: string | null;
          failed_login_attempts?: number;
          locked_until?: string | null;
          totp_secret?: string | null;
          is_2fa_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      admin_sessions: {
        Row: {
          id: string;
          admin_id: string;
          session_token: string;
          expires_at: string;
          ip_address: string | null;
          user_agent: string | null;
          is_active: boolean;
          created_at: string;
          last_activity_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          session_token: string;
          expires_at: string;
          ip_address?: string | null;
          user_agent?: string | null;
          is_active?: boolean;
          created_at?: string;
          last_activity_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          session_token?: string;
          expires_at?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          is_active?: boolean;
          created_at?: string;
          last_activity_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          admin_id: string;
          action: string;
          resource_type: string;
          resource_id: string | null;
          details: Record<string, any> | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          details?: Record<string, any> | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          action?: string;
          resource_type?: string;
          resource_id?: string | null;
          details?: Record<string, any> | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };
    };
    Functions: {
      app_place_bet: {
        Args: {
          p_user_id: string;
          p_bet_type: string;
          p_total_stake_cents: number;
          p_selections: any;
        };
        Returns: {
          success: boolean;
          bet_id?: string;
          error?: string;
        };
      };
      app_finalize_bet: {
        Args: {
          p_bet_id: string;
          p_outcome: string;
          p_payout_cents: number;
        };
        Returns: {
          success: boolean;
          error?: string;
        };
      };
      app_refund_bet: {
        Args: {
          p_bet_id: string;
        };
        Returns: {
          success: boolean;
          error?: string;
        };
      };
    };
  };
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];