export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type CampaignType = "territory" | "collage" | "choropleth" | "heatmap";
export type ContributionType = "cleanup" | "photo" | "registration" | "advocacy";
export type CampaignStatus = "draft" | "active" | "completed" | "paused";
export type GeoUnit = "census_tract" | "zip" | "state" | "point";
export type EntityType = "user" | "group";
export type MemberRole = "admin" | "member";
export type EventStatus = "active" | "resolved" | "expired";
export type ReportSeverity = "low" | "medium" | "high";
export type ReportStatus = "open" | "addressed" | "verified";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          total_contributions: number;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["profiles"]["Row"], "total_contributions" | "created_at"> & {
          total_contributions?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      groups: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          logo_url: string | null;
          website: string | null;
          verified: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["groups"]["Row"], "id" | "verified" | "created_at"> & {
          id?: string;
          verified?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["groups"]["Insert"]>;
      };
      group_members: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          role: MemberRole;
          joined_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          role?: MemberRole;
          joined_at?: string;
        };
        Update: Partial<{
          group_id: string;
          user_id: string;
          role: MemberRole;
          joined_at: string;
        }>;
      };
      campaigns: {
        Row: {
          id: string;
          slug: string;
          title: string;
          description: string | null;
          campaign_type: CampaignType;
          contribution_type: ContributionType;
          geo_scope: Json | null;
          geo_unit: GeoUnit | null;
          win_condition: Json | null;
          scoring_rules: Json | null;
          status: CampaignStatus;
          starts_at: string | null;
          ends_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["campaigns"]["Row"], "id" | "status" | "created_at"> & {
          id?: string;
          status?: CampaignStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["campaigns"]["Insert"]>;
      };
      contributions: {
        Row: {
          id: string;
          campaign_id: string;
          user_id: string | null;
          group_id: string | null;
          geo_unit_id: string | null;
          contribution_type: string;
          value: number | null;
          photo_url: string | null;
          location: unknown | null;
          location_verified: boolean;
          notes: string | null;
          submitted_at: string;
          validated_at: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["contributions"]["Row"], "id" | "location_verified" | "submitted_at"> & {
          id?: string;
          location_verified?: boolean;
          submitted_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contributions"]["Insert"]>;
      };
      geo_units: {
        Row: {
          id: string;
          campaign_id: string;
          unit_id: string;
          unit_type: string;
          geometry: unknown;
          geojson: Json | null;
          display_name: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["geo_units"]["Row"], "id"> & {
          id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["geo_units"]["Insert"]>;
      };
      territory_claims: {
        Row: {
          id: string;
          campaign_id: string;
          geo_unit_id: string;
          claimed_by_user: string | null;
          claimed_by_group: string | null;
          total_value: number;
          last_contribution_at: string | null;
          decay_starts_at: string | null;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["territory_claims"]["Row"], "id" | "total_value" | "updated_at"> & {
          id?: string;
          total_value?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["territory_claims"]["Insert"]>;
      };
      leaderboard_entries: {
        Row: {
          id: string;
          campaign_id: string;
          entity_type: EntityType;
          entity_id: string;
          rank: number | null;
          total_value: number;
          contribution_count: number;
          tracts_claimed: number;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["leaderboard_entries"]["Row"], "id" | "total_value" | "contribution_count" | "tracts_claimed" | "updated_at"> & {
          id?: string;
          total_value?: number;
          contribution_count?: number;
          tracts_claimed?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leaderboard_entries"]["Insert"]>;
      };
      campaign_events: {
        Row: {
          id: string;
          campaign_id: string;
          trigger_id: string | null;
          geo_unit_id: string | null;
          event_type: string;
          title: string;
          description: string | null;
          effect_config: Json | null;
          status: EventStatus;
          started_at: string;
          ends_at: string | null;
          resolved_at: string | null;
        };
        Insert: Omit<Database["public"]["Tables"]["campaign_events"]["Row"], "id" | "status" | "started_at"> & {
          id?: string;
          status?: EventStatus;
          started_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["campaign_events"]["Insert"]>;
      };
      user_notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string | null;
          campaign_id: string | null;
          campaign_slug: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type?: string;
          title: string;
          body?: string | null;
          campaign_id?: string | null;
          campaign_slug?: string | null;
          read?: boolean;
          created_at?: string;
        };
        Update: Partial<{
          type: string;
          title: string;
          body: string | null;
          campaign_id: string | null;
          campaign_slug: string | null;
          read: boolean;
        }>;
      };
      problem_reports: {
        Row: {
          id: string;
          campaign_id: string | null;
          geo_unit_id: string | null;
          reported_by: string | null;
          photo_url: string;
          location: unknown;
          severity: ReportSeverity;
          status: ReportStatus;
          reported_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["problem_reports"]["Row"], "id" | "severity" | "status" | "reported_at"> & {
          id?: string;
          severity?: ReportSeverity;
          status?: ReportStatus;
          reported_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["problem_reports"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
