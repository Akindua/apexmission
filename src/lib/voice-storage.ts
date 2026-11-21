import { supabase } from "@/integrations/supabase/client";

export async function saveVoiceLogToSupabase(transcript: string): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  const uid = (user as { id: string } | null)?.id;
  if (authError || !uid) {
    console.error("[VoiceLog] Auth error:", authError);
    throw new Error("Not authenticated");
  }

  const { error } = await (supabase as any).from("voice_logs").insert({
    user_id: uid,
    transcript,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[VoiceLog] Save error:", error);
    throw error;
  }
}
