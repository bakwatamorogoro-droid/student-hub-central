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
      announcements: {
        Row: {
          active: boolean
          created_at: string
          expires_at: string | null
          id: string
          message: string
          pdf_url: string | null
          title: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          message: string
          pdf_url?: string | null
          title?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          message?: string
          pdf_url?: string | null
          title?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          admin_password: string
          admin_username: string
          attendance_gps_required: boolean
          attendance_lat: number | null
          attendance_lng: number | null
          attendance_radius_m: number
          global_audio: boolean
          global_camera: boolean
          global_gps: boolean
          group_list: Json
          id: number
          issues_enabled: boolean
          lock_message: string
          lock_until: string | null
          profile_edits_enabled: boolean
          register_gps_required: boolean
          register_radius_m: number
          results_secret_slug: string
          semina_list: Json
          system_locked: boolean
          updated_at: string
        }
        Insert: {
          admin_password?: string
          admin_username?: string
          attendance_gps_required?: boolean
          attendance_lat?: number | null
          attendance_lng?: number | null
          attendance_radius_m?: number
          global_audio?: boolean
          global_camera?: boolean
          global_gps?: boolean
          group_list?: Json
          id?: number
          issues_enabled?: boolean
          lock_message?: string
          lock_until?: string | null
          profile_edits_enabled?: boolean
          register_gps_required?: boolean
          register_radius_m?: number
          results_secret_slug?: string
          semina_list?: Json
          system_locked?: boolean
          updated_at?: string
        }
        Update: {
          admin_password?: string
          admin_username?: string
          attendance_gps_required?: boolean
          attendance_lat?: number | null
          attendance_lng?: number | null
          attendance_radius_m?: number
          global_audio?: boolean
          global_camera?: boolean
          global_gps?: boolean
          group_list?: Json
          id?: number
          issues_enabled?: boolean
          lock_message?: string
          lock_until?: string | null
          profile_edits_enabled?: boolean
          register_gps_required?: boolean
          register_radius_m?: number
          results_secret_slug?: string
          semina_list?: Json
          system_locked?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          check_in_date: string
          confirmed_at: string | null
          confirmed_by_admin: boolean
          created_at: string
          distance_m: number | null
          full_name: string
          gps_lat: number | null
          gps_lng: number | null
          id: string
          reg_no: string
          semina: string | null
          signature_data: string | null
          status: string
          student_group: string | null
          student_id: string
        }
        Insert: {
          check_in_date?: string
          confirmed_at?: string | null
          confirmed_by_admin?: boolean
          created_at?: string
          distance_m?: number | null
          full_name: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          reg_no: string
          semina?: string | null
          signature_data?: string | null
          status?: string
          student_group?: string | null
          student_id: string
        }
        Update: {
          check_in_date?: string
          confirmed_at?: string | null
          confirmed_by_admin?: boolean
          created_at?: string
          distance_m?: number | null
          full_name?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          reg_no?: string
          semina?: string | null
          signature_data?: string | null
          status?: string
          student_group?: string | null
          student_id?: string
        }
        Relationships: []
      }
      daily_visits: {
        Row: {
          created_at: string
          device_id: string
          id: string
          visit_date: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          visit_date?: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          visit_date?: string
        }
        Relationships: []
      }
      exam_pdfs: {
        Row: {
          active: boolean
          assignment_text: string | null
          correct_answer: string | null
          created_at: string
          due_at: string | null
          exam_id: string | null
          file_name: string | null
          file_url: string
          id: string
          is_assignment: boolean
          points: number
          target_academic_year: string | null
          target_study_year: number | null
          title: string
          uploaded_by: string | null
        }
        Insert: {
          active?: boolean
          assignment_text?: string | null
          correct_answer?: string | null
          created_at?: string
          due_at?: string | null
          exam_id?: string | null
          file_name?: string | null
          file_url: string
          id?: string
          is_assignment?: boolean
          points?: number
          target_academic_year?: string | null
          target_study_year?: number | null
          title: string
          uploaded_by?: string | null
        }
        Update: {
          active?: boolean
          assignment_text?: string | null
          correct_answer?: string | null
          created_at?: string
          due_at?: string | null
          exam_id?: string | null
          file_name?: string | null
          file_url?: string
          id?: string
          is_assignment?: boolean
          points?: number
          target_academic_year?: string | null
          target_study_year?: number | null
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_pdfs_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          assignment_mode: string | null
          autosave_disabled: boolean
          created_at: string
          description: string | null
          duration_minutes: number
          end_time: string | null
          id: string
          published: boolean
          quiz_active: boolean
          quiz_mode: string | null
          randomize_matching: boolean
          randomize_mcq: boolean
          randomize_questions: boolean
          randomize_tf: boolean
          require_audio: boolean
          require_camera: boolean
          require_gps: boolean
          require_signature: boolean
          results_published: boolean
          start_time: string | null
          target_academic_year: string | null
          target_study_year: number | null
          test_number: number | null
          title: string
        }
        Insert: {
          assignment_mode?: string | null
          autosave_disabled?: boolean
          created_at?: string
          description?: string | null
          duration_minutes?: number
          end_time?: string | null
          id?: string
          published?: boolean
          quiz_active?: boolean
          quiz_mode?: string | null
          randomize_matching?: boolean
          randomize_mcq?: boolean
          randomize_questions?: boolean
          randomize_tf?: boolean
          require_audio?: boolean
          require_camera?: boolean
          require_gps?: boolean
          require_signature?: boolean
          results_published?: boolean
          start_time?: string | null
          target_academic_year?: string | null
          target_study_year?: number | null
          test_number?: number | null
          title: string
        }
        Update: {
          assignment_mode?: string | null
          autosave_disabled?: boolean
          created_at?: string
          description?: string | null
          duration_minutes?: number
          end_time?: string | null
          id?: string
          published?: boolean
          quiz_active?: boolean
          quiz_mode?: string | null
          randomize_matching?: boolean
          randomize_mcq?: boolean
          randomize_questions?: boolean
          randomize_tf?: boolean
          require_audio?: boolean
          require_camera?: boolean
          require_gps?: boolean
          require_signature?: boolean
          results_published?: boolean
          start_time?: string | null
          target_academic_year?: string | null
          target_study_year?: number | null
          test_number?: number | null
          title?: string
        }
        Relationships: []
      }
      group_messages: {
        Row: {
          created_at: string
          exam_id: string
          full_name: string
          id: string
          message: string
          semina: string | null
          student_group: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          full_name: string
          id?: string
          message: string
          semina?: string | null
          student_group?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          full_name?: string
          id?: string
          message?: string
          semina?: string | null
          student_group?: string | null
          student_id?: string
        }
        Relationships: []
      }
      issue_reports: {
        Row: {
          admin_reply: string | null
          category: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          message: string
          phone: string | null
          reg_no: string
          replied_at: string | null
          status: string
        }
        Insert: {
          admin_reply?: string | null
          category?: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          message: string
          phone?: string | null
          reg_no: string
          replied_at?: string | null
          status?: string
        }
        Update: {
          admin_reply?: string | null
          category?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          message?: string
          phone?: string | null
          reg_no?: string
          replied_at?: string | null
          status?: string
        }
        Relationships: []
      }
      pdf_submissions: {
        Row: {
          ai_extracted_text: string | null
          ai_suggested_at: string | null
          ai_suggested_feedback: string | null
          ai_suggested_score: number | null
          assignment_id: string | null
          created_at: string
          exam_id: string | null
          feedback: string | null
          file_name: string | null
          file_url: string
          full_name: string
          graded_at: string | null
          id: string
          max_score: number | null
          reg_no: string
          score: number | null
          semina: string | null
          status: string
          student_group: string | null
          student_id: string | null
          teacher_confirmed: boolean
        }
        Insert: {
          ai_extracted_text?: string | null
          ai_suggested_at?: string | null
          ai_suggested_feedback?: string | null
          ai_suggested_score?: number | null
          assignment_id?: string | null
          created_at?: string
          exam_id?: string | null
          feedback?: string | null
          file_name?: string | null
          file_url: string
          full_name: string
          graded_at?: string | null
          id?: string
          max_score?: number | null
          reg_no: string
          score?: number | null
          semina?: string | null
          status?: string
          student_group?: string | null
          student_id?: string | null
          teacher_confirmed?: boolean
        }
        Update: {
          ai_extracted_text?: string | null
          ai_suggested_at?: string | null
          ai_suggested_feedback?: string | null
          ai_suggested_score?: number | null
          assignment_id?: string | null
          created_at?: string
          exam_id?: string | null
          feedback?: string | null
          file_name?: string | null
          file_url?: string
          full_name?: string
          graded_at?: string | null
          id?: string
          max_score?: number | null
          reg_no?: string
          score?: number | null
          semina?: string | null
          status?: string
          student_group?: string | null
          student_id?: string | null
          teacher_confirmed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pdf_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "exam_pdfs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_submissions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_update_requests: {
        Row: {
          created_at: string
          current_full_name: string
          current_reg_no: string
          id: string
          new_full_name: string | null
          new_reg_no: string | null
          new_semina: string | null
          new_student_group: string | null
          reason: string | null
          reviewed_at: string | null
          status: string
          student_id: string
        }
        Insert: {
          created_at?: string
          current_full_name: string
          current_reg_no: string
          id?: string
          new_full_name?: string | null
          new_reg_no?: string | null
          new_semina?: string | null
          new_student_group?: string | null
          reason?: string | null
          reviewed_at?: string | null
          status?: string
          student_id: string
        }
        Update: {
          created_at?: string
          current_full_name?: string
          current_reg_no?: string
          id?: string
          new_full_name?: string | null
          new_reg_no?: string | null
          new_semina?: string | null
          new_student_group?: string | null
          reason?: string | null
          reviewed_at?: string | null
          status?: string
          student_id?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          body: string
          concepts: Json | null
          correct_answer: Json
          created_at: string
          exam_id: string
          id: string
          options: Json | null
          points: number
          position: number
          question_type: string
        }
        Insert: {
          body: string
          concepts?: Json | null
          correct_answer: Json
          created_at?: string
          exam_id: string
          id?: string
          options?: Json | null
          points?: number
          position?: number
          question_type: string
        }
        Update: {
          body?: string
          concepts?: Json | null
          correct_answer?: Json
          created_at?: string
          exam_id?: string
          id?: string
          options?: Json | null
          points?: number
          position?: number
          question_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_participants: {
        Row: {
          exam_id: string
          full_name: string
          id: string
          joined_at: string
          reg_no: string
          semina: string | null
          student_group: string | null
          student_id: string
        }
        Insert: {
          exam_id: string
          full_name: string
          id?: string
          joined_at?: string
          reg_no: string
          semina?: string | null
          student_group?: string | null
          student_id: string
        }
        Update: {
          exam_id?: string
          full_name?: string
          id?: string
          joined_at?: string
          reg_no?: string
          semina?: string | null
          student_group?: string | null
          student_id?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          academic_year: string | null
          age: number | null
          course: string | null
          created_at: string
          device_id: string
          full_name: string
          gender: string | null
          id: string
          phone: string | null
          reg_lat: number | null
          reg_lng: number | null
          reg_no: string
          semina: string
          student_group: string
          study_year: number | null
        }
        Insert: {
          academic_year?: string | null
          age?: number | null
          course?: string | null
          created_at?: string
          device_id: string
          full_name: string
          gender?: string | null
          id?: string
          phone?: string | null
          reg_lat?: number | null
          reg_lng?: number | null
          reg_no: string
          semina: string
          student_group: string
          study_year?: number | null
        }
        Update: {
          academic_year?: string | null
          age?: number | null
          course?: string | null
          created_at?: string
          device_id?: string
          full_name?: string
          gender?: string | null
          id?: string
          phone?: string | null
          reg_lat?: number | null
          reg_lng?: number | null
          reg_no?: string
          semina?: string
          student_group?: string
          study_year?: number | null
        }
        Relationships: []
      }
      study_images: {
        Row: {
          active: boolean
          caption: string | null
          category: string
          created_at: string
          id: string
          image_url: string
          position: number
          title: string | null
        }
        Insert: {
          active?: boolean
          caption?: string | null
          category?: string
          created_at?: string
          id?: string
          image_url: string
          position?: number
          title?: string | null
        }
        Update: {
          active?: boolean
          caption?: string | null
          category?: string
          created_at?: string
          id?: string
          image_url?: string
          position?: number
          title?: string | null
        }
        Relationships: []
      }
      submissions: {
        Row: {
          ai_confirmed: boolean
          ai_feedback: Json | null
          ai_score: number | null
          answers: Json
          auto_score: number | null
          device_id: string | null
          exam_id: string
          gps_lat: number | null
          gps_lng: number | null
          id: string
          max_score: number | null
          reg_no: string
          score: number | null
          signature_data: string | null
          started_at: string
          student_id: string
          submitted_at: string | null
        }
        Insert: {
          ai_confirmed?: boolean
          ai_feedback?: Json | null
          ai_score?: number | null
          answers?: Json
          auto_score?: number | null
          device_id?: string | null
          exam_id: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          max_score?: number | null
          reg_no: string
          score?: number | null
          signature_data?: string | null
          started_at?: string
          student_id: string
          submitted_at?: string | null
        }
        Update: {
          ai_confirmed?: boolean
          ai_feedback?: Json | null
          ai_score?: number | null
          answers?: Json
          auto_score?: number | null
          device_id?: string | null
          exam_id?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          max_score?: number | null
          reg_no?: string
          score?: number | null
          signature_data?: string | null
          started_at?: string
          student_id?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_profile_update: {
        Args: {
          p_new_full_name: string
          p_new_group: string
          p_new_reg_no: string
          p_new_semina: string
          p_student_id: string
        }
        Returns: undefined
      }
      // Added by supabase/HARDEN_ADMIN_PASSWORD.sql. Verifies the admin password
      // server-side so the app never selects app_settings.admin_password.
      admin_login: {
        Args: {
          p_username: string
          p_password: string
        }
        Returns: boolean
      }
      // Added by supabase/APPLY_STUDENT_PIN_AUTH.sql. Minting a token is an admin
      // action, so the admin's session token is required and checked in SQL.
      attendance_rotate_token: {
        Args: { p_session_id: string; p_admin_token: string }
        Returns: { token: string; expires_at: string }[]
      }
      // The student is identified by the sign-in token from student_login(),
      // never by anything the browser can choose.
      attendance_check_in_qr: {
        Args: {
          p_token: string
          p_lat: number
          p_lng: number
          p_student_token: string | null
        }
        Returns: {
          ok: boolean
          reason: string | null
          full_name: string | null
          semina: string | null
          distance_m: number | null
          radius_m: number | null
          check_in_at: string | null
        }[]
      }
      // Entry point that accepts either the rotating QR token or the session's
      // join code. Supersedes attendance_check_in_qr, which is kept as a wrapper.
      attendance_check_in: {
        Args: {
          p_token: string | null
          p_lat: number | null
          p_lng: number | null
          p_student_token: string | null
          p_join_code: string | null
        }
        Returns: {
          ok: boolean
          reason: string | null
          full_name: string | null
          semina: string | null
          distance_m: number | null
          radius_m: number | null
          check_in_at: string | null
        }[]
      }
      // The sessions a signed-in student may check in to right now.
      attendance_open_sessions: {
        Args: { p_student_token: string }
        Returns: {
          id: string
          title: string
          semina: string | null
          student_group: string | null
          radius_m: number
          has_join_code: boolean
        }[]
      }
      // The present list for one session. Read through a function because
      // HARDEN_RLS leaves `attendance` with no policy for the public key.
      attendance_session_present: {
        Args: { p_admin_token: string; p_session_id: string }
        Returns: {
          full_name: string
          reg_no: string
          created_at: string
          distance_m: number | null
          method: string | null
        }[]
      }
      // Start and close a session. Functions, not table writes, because
      // HARDEN_RLS leaves attendance_sessions with no policy.
      attendance_start_session: {
        Args: {
          p_admin_token: string
          p_title: string
          p_semina: string | null
          p_student_group: string | null
          p_lat: number | null
          p_lng: number | null
          p_radius_m: number
          p_join_code: string | null
        }
        Returns: {
          id: string
          join_code: string
          title: string
          semina: string | null
          student_group: string | null
          radius_m: number
        }[]
      }
      attendance_end_session: {
        Args: { p_admin_token: string; p_session_id: string }
        Returns: { ok: boolean }[]
      }
      student_link_account: {
        Args: { p_reg_no: string; p_user_id: string }
        Returns: { ok: boolean; reason: string | null; full_name: string | null }[]
      }
      // Added by supabase/APPLY_STUDENT_PIN_AUTH.sql. Student sign-in without
      // email: a PIN the admin issued, exchanged for a session token.
      admin_login_token: {
        Args: { p_username: string; p_password: string }
        Returns: { ok: boolean; token: string | null; expires_at: string | null }[]
      }
      admin_set_student_pin: {
        Args: { p_admin_token: string; p_reg_no: string; p_pin: string }
        Returns: { ok: boolean; reason: string | null; full_name: string | null }[]
      }
      // Claim a PIN without an admin: registration number plus the phone the
      // school already has on file. The PIN is returned once and bound to the
      // device that claimed it, so passing it on does not work.
      student_claim_pin: {
        Args: { p_reg_no: string; p_phone: string; p_device_id: string }
        Returns: {
          ok: boolean
          reason: string | null
          pin: string | null
          full_name: string | null
        }[]
      }
      student_login: {
        Args: { p_reg_no: string; p_pin: string; p_device_id: string | null }
        Returns: {
          ok: boolean
          reason: string | null
          token: string | null
          full_name: string | null
          expires_at: string | null
        }[]
      }
      student_me: {
        Args: { p_token: string }
        Returns: {
          ok: boolean
          full_name: string | null
          reg_no: string | null
          semina: string | null
          student_group: string | null
          course: string | null
          study_year: number | null
          academic_year: string | null
          attendance: Json | null
        }[]
      }
      student_logout: {
        Args: { p_token: string }
        Returns: boolean
      }
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
