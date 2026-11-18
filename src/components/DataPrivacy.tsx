"use client";

import { useState } from "react";
import { Download, Trash2, AlertTriangle, Loader2, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { exportAndDownload } from "@/lib/data-export";
import { performDataWipe } from "@/lib/data-wipe";

/**
 * DataPrivacy — Data export and deletion interface for the Settings page.
 *
 * Provides GDPR/PIPEDA-compliant controls for user data portability and
 * erasure:
 *   - Export: downloads all local IndexedDB + localStorage data as a JSON file
 *   - Wipe: securely deletes all local data with explicit confirmation
 *
 * All operations are client-side; no data is transmitted to any server.
 */
export function DataPrivacy() {
  const [exportLoading, setExportLoading] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeLoading, setWipeLoading] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState("");
  const [wipeResult, setWipeResult] = useState<{
    success: boolean;
    deletedDbNames: string[];
    clearedLocalStorageKeys: string[];
    error?: string;
  } | null>(null);

  const canConfirmWipe = wipeConfirmText === "DELETE";

  const handleExport = async () => {
    setExportLoading(true);
    setExportError(null);
    setExportSuccess(false);
    try {
      const { filename, recordCount } = await exportAndDownload();
      setExportSuccess(true);
      setExportError(null);
      // Auto-dismiss success after 5 seconds
      setTimeout(() => setExportSuccess(false), 5000);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed. Please try again.");
    } finally {
      setExportLoading(false);
    }
  };

  const handleWipe = async () => {
    setWipeLoading(true);
    setWipeResult(null);
    try {
      const result = await performDataWipe();
      setWipeResult(result);
      setWipeOpen(false);
      setWipeConfirmText("");
    } catch (err) {
      setWipeResult({
        success: false,
        deletedDbNames: [],
        clearedLocalStorageKeys: [],
        error: err instanceof Error ? err.message : "Wipe failed.",
      });
    } finally {
      setWipeLoading(false);
    }
  };

  return (
    <section className="mt-8">
      {/* Section header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-2 border-b border-emerald-500/15 pb-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-white">
            <AlertTriangle className="size-4 shrink-0 text-amber-400" />
            Data Export &amp; Deletion
          </h2>
          <p className="mt-1 text-[10px] font-medium leading-relaxed text-zinc-500">
            Export your local data or permanently delete it. These actions affect only data stored
            on this device — they do not change your Supabase account or server-side records.
          </p>
        </div>
      </div>

      {/* Export card */}
      <div className="rounded-xl border border-emerald-500/15 bg-black/40 p-5 mb-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-emerald-400">
              <Download className="size-3 shrink-0" />
              Export Your Data
            </h3>
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
              Download a JSON copy of all locally stored data, including your task matrix, mission,
              streak, and coach history.
            </p>
          </div>
        </div>

        {exportSuccess && (
          <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-3">
            <div className="flex items-center gap-2">
              <Check className="size-3.5 text-emerald-400" />
              <span className="text-[10px] font-bold text-emerald-300">
                Export downloaded successfully
              </span>
            </div>
          </div>
        )}

        {exportError && (
          <div className="mb-3 rounded-xl border border-rose-500/20 bg-rose-950/10 p-3">
            <div className="flex items-center gap-2">
              <X className="size-3.5 text-rose-400" />
              <span className="text-[10px] font-bold text-rose-300">{exportError}</span>
            </div>
          </div>
        )}

        <Button onClick={handleExport} disabled={exportLoading} className="w-full">
          {exportLoading ? (
            <>
              <Loader2 className="size-3.5 animate-spin mr-2" />
              Exporting…
            </>
          ) : (
            <>
              <Download className="size-3.5 mr-2" />
              Download Data Export (.json)
            </>
          )}
        </Button>
      </div>

      {/* Wipe card */}
      <div className="rounded-xl border border-rose-500/15 bg-rose-950/10 p-5 mb-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-rose-400">
              <Trash2 className="size-3 shrink-0" />
              Wipe Local Data
            </h3>
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">
              Permanently delete all locally stored data from this device. This action cannot be
              undone.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 mb-4">
          <p className="text-[10px] font-medium leading-relaxed text-zinc-400">
            <strong className="text-zinc-200">What will be deleted:</strong>
          </p>
          <ul className="mt-1.5 grid gap-1 text-[10px] text-zinc-500">
            <li className="flex items-start gap-1.5">
              <span className="text-zinc-600">•</span>
              <span>IndexedDB databases (task matrix, mission, coach data)</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-zinc-600">•</span>
              <span>localStorage preferences and cached state</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-zinc-600">•</span>
              <span>Encrypted storage keys and derived keys</span>
            </li>
          </ul>
          <p className="mt-2 text-[10px] font-bold text-rose-400">
            ⚠ This cannot be undone. Your data will be permanently lost.
          </p>
        </div>

        <Button onClick={() => setWipeOpen(true)} variant="destructive" className="w-full">
          Wipe All Local Data
        </Button>

        {/* Wipe confirmation dialog */}
        <Dialog open={wipeOpen} onOpenChange={setWipeOpen}>
          <DialogTrigger asChild />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete All Local Data?</DialogTitle>
              <DialogDescription>
                This will permanently delete all locally stored ApexMissions data from this device.
                This includes your task matrix, mission, streak, coach history, and cached
                preferences. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="mb-4">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                Type "DELETE" to confirm
              </label>
              <input
                type="text"
                value={wipeConfirmText}
                onChange={(e) => setWipeConfirmText(e.target.value)}
                autoCapitalize="characters"
                spellCheck={false}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-mono text-zinc-200 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors"
                placeholder="DELETE"
              />
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => setWipeOpen(false)} className="w-full">
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleWipe}
                disabled={wipeLoading || !canConfirmWipe}
                variant="destructive"
                className="w-full"
              >
                {wipeLoading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-2" />
                    Wiping…
                  </>
                ) : canConfirmWipe ? (
                  <>
                    <Trash2 className="size-3.5 mr-2" />
                    Yes, Delete All Data
                  </>
                ) : (
                  <>
                    <AlertTriangle className="size-3.5 mr-2" />
                    Type "DELETE" to confirm
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Wipe result dialog */}
        <Dialog
          open={wipeResult !== null}
          onOpenChange={(open) => {
            if (!open) setWipeResult(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{wipeResult?.success ? "Data Wiped" : "Wipe Failed"}</DialogTitle>
            </DialogHeader>
            <div className="mb-4">
              {wipeResult ? (
                wipeResult.success ? (
                  <>
                    <p className="text-[10px] leading-relaxed text-zinc-400">
                      All local data has been permanently deleted from this device.
                    </p>
                    {wipeResult.deletedDbNames.length > 0 && (
                      <p className="mt-1 text-[10px] text-zinc-500">
                        Databases removed: {wipeResult.deletedDbNames.join(", ")}
                      </p>
                    )}
                    {wipeResult.clearedLocalStorageKeys.length > 0 && (
                      <p className="mt-1 text-[10px] text-zinc-500">
                        LocalStorage keys cleared: {wipeResult.clearedLocalStorageKeys.join(", ")}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[10px] leading-relaxed text-rose-400">
                    {wipeResult.error || "An unexpected error occurred."}
                  </p>
                )
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => setWipeResult(null)} className="w-full">
                OK
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
