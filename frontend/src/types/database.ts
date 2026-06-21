export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type CampaignType = "territory" | "collage" | "choropleth" | "heatmap" | "hex_bloom";
export type ContributionType = "cleanup" | "photo" | "registration" | "advocacy" | "civic_action" | "unfollow" | "solarpunk_action" | "solarpunk_photo";
export type CampaignStatus = "draft" | "active" | "completed" | "paused";
export type GeoUnit = "census_tract" | "zip" | "state" | "point" | "h3_hex";
export type EntityType = "user" | "group";
export type MemberRole = "admin" | "member";
export type EventStatus = "active" | "resolved" | "expired";
export type ReportSeverity = "low" | "medium" | "high";
export type ActivityStatus = "open" | "scheduled" | "in_progress" | "completed" | "addressed" | "verified" | "cancelled";
export type ReportStatus = ActivityStatus;

export interface SocialLinks {
  website?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  facebook?: string | null;
  twitter?: string | null;
}

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
          image_url: string | null;
          social_links: SocialLinks | null;
          categories: string[];
          featured: boolean;
          verified: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["groups"]["Row"], "id" | "categories" | "featured" | "verified" | "created_at" | "updated_at"> & {
          id?: string;
          categories?: string[];
          featured?: boolean;
          verified?: boolean;
          created_at?: string;
          updated_at?: string;
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
          cleanup_id: string | null;
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
          geometry: unknown | null;
          geojson: Json | null;
          display_name: string | null;
          seed_source: string | null;
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
          submitted_by_user_id: string | null;
          image_urls: string[];
          location: unknown;
          severity: ReportSeverity;
          status: ReportStatus;
          resolved_by_user_id: string | null;
          resolved_by_cleanup_id: string | null;
          resolved_at: string | null;
          reported_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["problem_reports"]["Row"], "id" | "image_urls" | "severity" | "status" | "resolved_by_user_id" | "resolved_by_cleanup_id" | "resolved_at" | "reported_at"> & {
          id?: string;
          image_urls?: string[];
          severity?: ReportSeverity;
          status?: ReportStatus;
          resolved_by_user_id?: string | null;
          resolved_by_cleanup_id?: string | null;
          resolved_at?: string | null;
          reported_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["problem_reports"]["Insert"]>;
      };
      cleanups: {
        Row: {
          id: string;
          campaign_id: string | null;
          geo_unit_id: string | null;
          title: string;
          description: string | null;
          location: unknown | null;
          scheduled_start: string | null;
          scheduled_end: string | null;
          status: ActivityStatus;
          image_urls: string[];
          metrics_small_bags: number | null;
          metrics_large_bags: number | null;
          metrics_pounds: number | null;
          submitted_by_user_id: string | null;
          organizer_user_ids: string[];
          rsvp_user_ids: string[];
          attended_user_ids: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["cleanups"]["Row"], "id" | "title" | "status" | "image_urls" | "organizer_user_ids" | "rsvp_user_ids" | "attended_user_ids" | "created_at" | "updated_at"> & {
          id?: string;
          title?: string;
          status?: ActivityStatus;
          image_urls?: string[];
          organizer_user_ids?: string[];
          rsvp_user_ids?: string[];
          attended_user_ids?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cleanups"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
