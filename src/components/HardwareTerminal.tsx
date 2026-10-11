import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Zap, ShieldAlert, Monitor, CheckCircle } from "lucide-react";

interface UpgradeItem {
  id: string;
  name: string;
  cost: number;
  description: string;
  previewClass: string;
}

const UPGRADES: UpgradeItem[] = [
  { id: "layout-midnight", name: "Obsidian Core Matrix", cost: 300, description: "Deep midnight layout tint with soft emerald container lines.", previewClass: "bg-[#050508] border-emerald-500/20" },
  { id: "layout-cyber", name: "Cyberpunk Telemetry", cost: 600, description: "High-contrast tactical setup utilizing amber telemetry tags.", previewClass: "bg-black border-amber-500/20" },
  { id: "layout-stealth", name: "Stealth Stealth Operator", cost: 1200, description: "Minimalist layout with completely monochromatic slate highlights.", previewClass: "bg-[#090A0F] border-zinc-800" }
];

export const HardwareTerminal: React.FC = () => {
  const [points, setBetaPoints] = useState<number>(1000);
  const [unlocked, setUnlocked] = useState<string[]>(["default"]);
  const [syncing, setSyncy] = useState(false);

  useEffect(() => {
    const fetchUserStats = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("beta_points, unlocked_layouts").eq("id", user.id).single();
      if (data) {
        setBetaPoints(data.beta_points);
        setUnlocked(data.unlocked_layouts || ["default"]);
      }
    };
    fetchUserStats();
  }, []);

  const purchaseUpgrade = async (item: UpgradeItem) => {
    if (points < item.cost || unlocked.includes(item.id) || syncing) return;
    setSyncy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const updatedPoints = points - item.cost;
      const updatedLayouts = [...unlocked, item.id];

      // 1. Log the transaction directly inside the audit ledger table
      await supabase.from("points_ledger").insert({
        profile_id: user.id,
        amount_changed: -item.cost,
        transaction_reason: `Unlocked ${item.name} Console Interface`
      });

      // 2. Overwrite user profile balances inside the cloud table rows
      await supabase.from("profiles").update({
        beta_points: updatedPoints,
        unlocked_layouts: updatedLayouts
      }).eq("id", user.id);

      setBetaPoints(updatedPoints);
      setUnlocked(updatedLayouts);
      alert(`⚡ System parameters updated. ${item.name} configuration initialized.`);
    } catch (err) {
      console.error(err);
    } finally {
      setSyncy(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto rounded-2xl border border-zinc-800 bg-[#0D0D11] p-6 shadow-2xl text-left">
      <div className="flex items-center justify-between border-b border-zinc-900 pb-4 mb-6">
        <div>
          <h3 className="font-black text-sm text-white uppercase tracking-wider flex items-center gap-1.5"><Zap className="h-4 w-4 text-emerald-400 fill-emerald-400" /> Hardware Upgrades Terminal</h3>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">Redeem earned points to configure system telemetry</p>
        </div>
        <div className="font-mono text-sm font-black text-white bg-black border border-zinc-800 px-3 py-1.5 rounded-xl">
          ⭐ {points} Operator Points
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {UPGRADES.map((item) => {
          const isOwned = unlocked.includes(item.id);
          const canAfford = points >= item.cost;

          return (
            <div key={item.id} className="flex flex-col justify-between rounded-xl border border-zinc-900 bg-black/40 p-4.5 transition-all hover:border-zinc-800">
              <div>
                <div className={`h-24 w-full rounded-lg border mb-4 relative ${item.previewClass} flex items-center justify-center text-[10px] font-mono text-zinc-700`}>
                  <Monitor className="h-5 w-5 opacity-40 mb-1" />
                </div>
                <h4 className="text-sm font-bold text-white mb-1">{item.name}</h4>
                <p className="text-[11px] font-medium text-zinc-500 leading-normal mb-4">{item.description}</p>
              </div>

              <button
                type="button"
                disabled={isOwned || !canAfford || syncing}
                onClick={() => purchaseUpgrade(item)}
                className={`w-full rounded-lg py-2.5 text-center text-xs font-bold transition-all duration-200 ${
                  isOwned 
                    ? "bg-zinc-900/60 text-zinc-500 border border-zinc-800/40 cursor-default flex items-center justify-center gap-1" 
                    : canAfford 
                    ? "bg-white text-black hover:bg-emerald-400" 
                    : "bg-zinc-950 text-zinc-700 border border-zinc-900 cursor-not-allowed"
                }`}
              >
                {isOwned ? <><CheckCircle className="h-3.5 w-3.5" /> Activated</> : `Redeem For ${item.cost} pts`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
