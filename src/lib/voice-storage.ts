import { createClient } from "@supabase/supabase-js";
import { VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function saveVoiceLogToSupabase(transcript: string): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error("[VoiceLog] Auth error:", authError);
    throw new Error("Not authenticated");
  }

  const { error } = await supabase.from("voice_logs").insert({
    user_id: user.id,
    transcript,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[VoiceLog] Save error:", error);
    throw error;
  }
}
