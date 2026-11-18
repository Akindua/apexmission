"use client";

import { ShieldAlert, MessageSquare } from "lucide-react";

/**
 * JarvisDisclaimer — Legal disclaimer for Jarvis AI outputs.
 *
 * Displayed in the settings/help menu. States that Jarvis provides
 * informational self-improvement guidance and does not constitute
 * professional, medical, or legal advice.
 */
export function JarvisDisclaimer() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-start gap-3">
        <ShieldAlert className="size-5 shrink-0 text-zinc-600 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-white">About Jarvis AI</h3>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
            Jarvis is an AI-powered suggestive copilot that generates proactive
            nudges, workflow recommendations, and scheduling suggestions based
            on your mission, tasks, and execution data.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
          Important Disclaimer
        </h4>
        <p className="text-[10px] leading-relaxed text-zinc-500">
          Jarvis provides informational self-improvement guidance only. It does
          not constitute professional, medical, legal, or financial advice. All
          AI-generated suggestions require your explicit approval before any
          change is made to your data — Jarvis never acts autonomously. Use
          your own judgment when evaluating suggestions.
        </p>
      </div>

      <div className="mt-4">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">
          Privacy
        </h4>
        <p className="text-[10px] leading-relaxed text-zinc-500">
          Jarvis suggestions are stored locally on your device. When AI
          generation is used, prompts are sanitized and sent with zero-data-
          retention / zero-training headers. No personally identifiable
          information (email, tenant IDs, or account IDs) is included in LLM
          prompts.
        </p>
      </div>
    </div>
  );
}
