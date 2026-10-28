import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Flame, ShieldAlert, Award, Radio, X, BarChart3, History, ShieldCheck } from "lucide-react";

interface OperatorProfile {
  id: string;
  full_name: string | null;
  current_streak: number;
  failure_count: number;
  beta_points: number;
  operational_status: string;
  last_action_logged: string | null;
}

interface LedgerLog {
  id: string;
  amount_changed: number;
  transaction_reason: string;
  created_at: string;
}

export const LeaderboardConsole: React.FC = () => {
  const [operators, setOperators] = useState<OperatorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModalOperator, setActiveModalOperator] = useState<OperatorProfile | null>(null);
  const [ledgerLogs, setLedgerLogs] = useState<LedgerLog[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  useEffect(() => {
    const fetchCloudRankings = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, current_streak, failure_count, beta_points, operational_status, last_action_logged")
          .order("beta_points", { ascending: false });

        if (error) throw error;
        setOperators(data || []);
      } catch (err) {
        console.error("Failed to query live dashboard arrays:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCloudRankings();
  }, []);

  // Dynamically load point audit ledgers for the selected operator profile node
  const handleOpenAnalytics = async (op: OperatorProfile) => {
    setActiveModalOperator(op);
    setLoadingLedger(true);
    try {
      const { data, error } = await supabase
        .from("points_ledger")
        .select("id, amount_changed, transaction_reason, created_at")
        .eq("profile_id", op.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      setLedgerLogs(data || []);
    } catch (err) {
      console.error("Ledger query failed:", err);
    } finally {
      setLoadingLedger(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl border border-zinc-800 bg-[#0D0D11] p-6 shadow-2xl relative">
      <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <Award className="h-5 w-5 text-emerald-400 animate-pulse" />
          <div className="text-left">
            <h3 className="font-black text-sm text-white uppercase tracking-wider">Live Operator Rankings</h3>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">Real-Time Account Balance Grid</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-400 bg-emerald-950/20 px-2 py-1 rounded border border-emerald-500/10">
          <Radio className="h-3 w-3 animate-ping" /> Global Sync Active
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs font-bold text-zinc-500 animate-pulse uppercase tracking-wider">
          Querying safe operational ranks...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-semibold text-zinc-400">
            <thead>
              <tr className="border-b border-zinc-900/60 text-[10px] font-black tracking-widest text-zinc-500 uppercase">
                <th className="py-3 px-4">Rank</th>
                <th className="py-3 px-4">Operator</th>
                <th className="py-3 px-4">Ledger Balance</th>
                <th className="py-3 px-4">Streak Status</th>
                <th className="py-3 px-4 text-center">Audit Logs</th>
                <th className="py-3 px-4 text-right">Status State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/40">
              {operators.map((op, index) => (
                <tr key={op.id} className="transition-all duration-200 hover:bg-zinc-900/20">
                  <td className="py-4 px-4 font-mono text-zinc-500 tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </td>
                  <td className="py-4 px-4 font-bold text-white whitespace-nowrap">
                    {op.full_name}
                  </td>
                  <td className="py-4 px-4 font-mono text-white font-black">
                    ⭐ {op.beta_points} pts
                  </td>
                  <td className="py-4 px-4 tabular-nums">
                    <span className="inline-flex items-center gap-1 text-orange-400 font-bold font-mono text-[11px]">
                      <Flame className="h-3.5 w-3.5 fill-orange-400 text-orange-500" />
                      {op.current_streak} Day{op.current_streak === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleOpenAnalytics(op)}
                      className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 text-zinc-400 transition-all hover:border-emerald-500/30 hover:text-emerald-400"
                    >
                      <History className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  <td className="py-4 px-4 text-right whitespace-nowrap">
                    <span className={`inline-block rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                      op.operational_status === "FALLEN"
                        ? "border-rose-500/20 bg-rose-950/20 text-rose-400"
                        : "border-emerald-500/30 bg-emerald-950/20 text-emerald-400"
                    }`}>
                      {op.operational_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 📊 LIVE POINT DEDUCTION ANALYTICS LEDGER MODAL */}
      {activeModalOperator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0D0D11] p-6 shadow-2xl text-left">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3 mb-4">
              <div>
                <h4 className="text-sm font-black text-white uppercase tracking-wider">System Deficit Ledger</h4>
                <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">Operator ID: {activeModalOperator.full_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModalOperator(null)}
                className="rounded-lg border border-zinc-800 bg-zinc-950 p-1.5 text-zinc-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 mt-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-2">Recent Balance Transmissions</p>
              
              {loadingLedger ? (
                <p className="text-xs text-zinc-600 italic py-4 animate-pulse">Syncing delta transaction entries...</p>
              ) : ledgerLogs.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/10 bg-emerald-950/5 p-4 text-xs font-bold text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                  <p>Prisinte Account Integrity. No execution deficits or manual penalties indexed.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {ledgerLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between p-3 rounded-xl border border-zinc-900 bg-black/30 text-xs">
                      <div className="text-left">
                        <p className="font-bold text-zinc-200">{log.transaction_reason}</p>
                        <p className="text-[10px] text-zinc-600 font-mono mt-0.5">{new Date(log.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className={`font-mono font-black px-2 py-0.5 rounded text-[11px] ${
                        log.amount_changed < 0 ? "bg-rose-950/20 text-rose-400 border-rose-500/20" : "bg-emerald-950/20 text-emerald-400 border-emerald-500/20"
                      }`}>
                        {log.amount_changed < 0 ? "" : "+"}{log.amount_changed}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
