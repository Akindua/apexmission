/**
 * JarvisNudge styles — design tokens and variant mappings for dark-mode
 * compatible UI components in the emerald/zinc design system.
 */

import { type VariantProps, cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Base card container styles.
 */
export const nudgeBase = cn(
  "flex flex-col gap-3 rounded-xl border p-4 text-left backdrop-blur-xl transition-colors duration-300"
);

/**
 * Variant mappings for the card surface based on state.
 */
export const nudgeVariants = cva(nudgeBase, {
  variants: {
    state: {
      pending:
        "border-emerald-500/25 bg-emerald-950/10 shadow-[0_0_20px_rgba(16,185,129,0.08)]",
      applied:
        "border-emerald-500/30 bg-emerald-950/20 shadow-[0_0_20px_rgba(16,185,129,0.10)]",
      dismissed:
        "border-zinc-800/30 bg-zinc-900/50",
      default:
        "border-zinc-800/30 bg-zinc-900/50 hover:border-zinc-700/50",
    },
  },
  defaultVariants: {
    state: "default",
  },
});

/**
 * Badge styles for the transparency indicator.
 */
export const jarvisBadgeBase = cn(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
  "border-emerald-500/30 bg-emerald-950/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
);

export const jarvisBadgeSm = cn(
  jarvisBadgeBase,
  "text-[9px] px-1.5 py-0.5"
);

export const jarvisBadgeMd = cn(
  jarvisBadgeBase,
  "text-[10px] px-2 py-0.5"
);

/**
 * Applied/shield badge styles.
 */
export const jarvisShieldBadgeBase = cn(
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
  "border-emerald-500/30 bg-emerald-950/20 text-emerald-400"
);

/**
 * Button styles.
 */
export const nudgeApplyButton = cn(
  "flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-[10px] font-bold text-black shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all",
  "hover:bg-emerald-400 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
);

export const nudgeDismissButton = cn(
  "flex items-center justify-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-[10px] font-bold text-zinc-400 transition-colors",
  "hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:pointer-events-none"
);

/**
 * Processing (loading) overlay state.
 */
export const nudgeProcessing = "animate-pulse";

/**
 * Text color tokens.
 */
export const nudgeText = {
  heading: "text-sm font-bold text-white leading-snug",
  body: "mt-1 leading-relaxed text-zinc-300",
  rationaleLabel: "text-[9px] font-bold uppercase tracking-wider text-zinc-500/70",
  rationaleBody: "mt-0.5 text-[10px] leading-relaxed text-zinc-500",
  meta: "text-[9px] font-bold uppercase tracking-wider text-zinc-600",
  confidence: "text-[9px] font-bold text-emerald-400/70",
};

/**
 * Layout tokens.
 */
export const nudgeLayout = {
  headerBadge: "inline-flex items-center gap-2",
  headerBadgeChip:
    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider",
  headerBadgeChipMd:
    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
  actionRow: "mt-4 flex items-center justify-between gap-2",
  metaRow: "mt-3 flex items-center justify-between gap-2",
  rationaleBlock: "mt-3 pt-3 border-t border-zinc-800/50",
  transcriptBlock:
    "rounded-lg border border-zinc-800 bg-zinc-900 p-3 mb-3",
  transcriptLabel:
    "text-[10px] font-bold uppercase tracking-wider text-zinc-500",
  transcriptBody: "text-[11px] leading-relaxed text-zinc-300",
};

export type NudgeVariantProps = VariantProps<typeof nudgeVariants>;
