// Supabase Database Types for Betting Application - Matching User's Actual Schema
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          username: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          balance: number; // INTEGER - Balance in cents
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          username: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          balance?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
          balance?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      bets: {
        Row: {
          id: string;
          user_id: string;
          type: 'single' | 'express' | 'system'; // bet_type enum
          total_stake: number; // INTEGER - Stake in cents
          potential_winnings: number; // INTEGER - Winnings in cents
          total_odds: string; // VARCHAR(20)
          status: 'pending' | 'won' | 'lost' | 'cashout' | 'cancelled'; // bet_status enum
          placed_at: string;
          settled_at: string | null;
          actual_winnings: number; // INTEGER - Actual winnings in cents
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: 'single' | 'express' | 'system';
          total_stake: number;
          potential_winnings: number;
          total_odds: string;
          status?: 'pending' | 'won' | 'lost' | 'cashout' | 'cancelled';
          placed_at?: string;
          settled_at?: string | null;
          actual_winnings?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: 'single' | 'express' | 'system';
          total_stake?: number;
          potential_winnings?: number;
          total_odds?: string;
          status?: 'pending' | 'won' | 'lost' | 'cashout' | 'cancelled';
          placed_at?: string;
          settled_at?: string | null;
          actual_winnings?: number;
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
          market_id: string;
          outcome_id: string;
          market: string;
          selection: string;
          odds: string; // VARCHAR(20)
          status: 'pending' | 'won' | 'lost' | 'void'; // bet_selection_status enum
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
          market_id: string;
          outcome_id: string;
          market: string;
          selection: string;
          odds: string;
          status?: 'pending' | 'won' | 'lost' | 'void';
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
          market_id?: string;
          outcome_id?: string;
          market?: string;
          selection?: string;
          odds?: string;
          status?: 'pending' | 'won' | 'lost' | 'void';
          result?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: 'deposit' | 'withdrawal' | 'bet_stake' | 'bet_winnings' | 'bonus'; // transaction_type enum
          amount: number; // INTEGER - Amount in cents (can be negative)
          balance_before: number; // INTEGER
          balance_after: number; // INTEGER
          reference: string | null; // VARCHAR(255)
          description: string | null; // TEXT
          status: 'pending' | 'completed' | 'failed'; // transaction_status enum
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: 'deposit' | 'withdrawal' | 'bet_stake' | 'bet_winnings' | 'bonus';
          amount: number;
          balance_before: number;
          balance_after: number;
          reference?: string | null;
          description?: string | null;
          status?: 'pending' | 'completed' | 'failed';
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: 'deposit' | 'withdrawal' | 'bet_stake' | 'bet_winnings' | 'bonus';
          amount?: number;
          balance_before?: number;
          balance_after?: number;
          reference?: string | null;
          description?: string | null;
          status?: 'pending' | 'completed' | 'failed';
          created_at?: string;
        };
      };
      user_favorites: {
        Row: {
          id: string;
          user_id: string;
          type: 'team' | 'league' | 'fixture'; // favorite_type enum
          entity_id: string; // VARCHAR(255)
          entity_name: string; // VARCHAR(255)
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: 'team' | 'league' | 'fixture';
          entity_id: string;
          entity_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: 'team' | 'league' | 'fixture';
          entity_id?: string;
          entity_name?: string;
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