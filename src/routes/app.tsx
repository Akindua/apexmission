import { createFileRoute } from '@tanstack/react-router'
function ApexMission() {
  const [state, setState] = useState<MissionState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [drafts, setDrafts] = useState<Record<ImpactTier, string>>({ high: "", medium: "", low: "" });
  const [dailyDraft, setDailyDraft] = useState("");
  const [justCompleted, setJustCompleted] = useState(false);
  const [resetMs, setResetMs] = useState<number | null>(null);
  const [paywall, setPaywall] = useState<string | null>(null);
  const loaded = useRef(false);


  const navigate = useNavigate();
  const checkout = useServerFn(startCheckout);
  const { premium, tier } = useSubscriptionTier();

  // Live countdown to the next daily reset (local midnight). Initialized in an
  // effect so SSR and first client render match (no hydration mismatch).
  useEffect(() => {
    setResetMs(msUntilReset());
    const id = window.setInterval(() => setResetMs(msUntilReset()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Load persisted state after hydration (avoids SSR mismatch)
  useEffect(() => {
    const s = loadState();
    setState(s);
    setDailyDraft(s.daily.text);
    loaded.current = true;
    setHydrated(true);
  }, []);

  // Persist on change
  useEffect(() => {
    if (loaded.current) saveState(state);
  }, [state]);

  const { total, done } = useMemo(() => {
    let total = 0;
    let done = 0;
    for (const tier of TIERS) {
      for (const t of state.tasks[tier.key]) {
        total += 1;
        if (t.done) done += 1;
      }
    }
    return { total, done };
  }, [state.tasks]);

  const progress = total === 0 ? 0 : Math.round((done / total) * 100);

  function addTask(tier: ImpactTier) {
    const text = drafts[tier].trim();
    if (!text) return;
    if (!premium && total >= FREE_TASK_LIMIT) {
      setPaywall(
        `The free plan tracks up to ${FREE_TASK_LIMIT} priority tasks. Upgrade to map out your full mission without limits.`,
      );
      return;
    }
    setState((s) => ({
      ...s,
      tasks: { ...s.tasks, [tier]: [...s.tasks[tier], { id: nextId(), text, done: false }] },
    }));
    setDrafts((d) => ({ ...d, [tier]: "" }));
  }

  function runAiBreakdown() {
    if (!premium) {
      setPaywall("AI Mission Breakdown is a premium feature. Upgrade to turn any mission into concrete priorities instantly.");
      return;
    }
    const generated = aiBreakdown(state.mission);
    setState((s) => ({
      ...s,
      tasks: {
        ...s.tasks,
        high: [...s.tasks.high, ...generated.map((text) => ({ id: nextId(), text, done: false }))],
      },
    }));
  }

  async function handleUpgrade(planId: string) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      navigate({ to: "/auth", search: { next: "/pricing" } });
      return;
    }
    try {
      const res = await checkout({
        data: { plan: planId as PlanId, origin: window.location.origin },
      });
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      setPaywall(res.message);
    } catch (e) {
      setPaywall(e instanceof Error ? e.message : "Checkout could not be started.");
    }
  }


  function toggleTask(tier: ImpactTier, id: string) {
    setState((s) => ({
      ...s,
      tasks: {
        ...s.tasks,
        [tier]: s.tasks[tier].map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      },
    }));
  }

  function removeTask(tier: ImpactTier, id: string) {
    setState((s) => ({
      ...s,
      tasks: { ...s.tasks, [tier]: s.tasks[tier].filter((t) => t.id !== id) },
    }));
  }

  function commitDailyText() {
    const text = dailyDraft.trim();
    setState((s) => ({ ...s, daily: { ...s.daily, text, date: todayKey() } }));
  }

  function toggleDaily() {
    if (!state.daily.text.trim()) return;
    setState((s) => {
      const done = !s.daily.done;
      return {
        ...s,
        daily: { ...s.daily, done, date: todayKey() },
        streak: done ? completeDailyToday(s.streak) : s.streak,
      };
    });
    if (!state.daily.done) {
      setJustCompleted(true);
      window.setTimeout(() => setJustCompleted(false), 500);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-8 sm:py-8">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-secondary">
              <Target className="size-4 text-foreground" />
            </div>
            <span className="font-display text-sm font-semibold tracking-[0.22em] text-muted-foreground uppercase">
              ApexMission
            </span>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </span>
        </header>

        {/* 1. THE MISSION CARD */}
        <section className="card-surface relative overflow-hidden p-6 sm:p-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/25 to-transparent" />
          <label
            htmlFor="mission"
            className="text-[11px] font-semibold tracking-[0.28em] text-muted-foreground uppercase"
          >
            The Mission
          </label>
          <input
            id="mission"
            value={state.mission}
            onChange={(e) => setState((s) => ({ ...s, mission: e.target.value }))}
            placeholder="Lock in your overarching vision…"
            className="mt-3 w-full bg-transparent font-display text-2xl font-bold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40 sm:text-4xl"
          />
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div className="h-1.5 min-w-40 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="font-display text-sm font-semibold text-muted-foreground tabular-nums">
              {total === 0 ? "No tasks yet" : `${progress}% · ${done}/${total} done`}
            </span>
            <button
              type="button"
              onClick={runAiBreakdown}
              className={`group flex h-9 items-center gap-2 rounded-lg border border-input px-3.5 text-xs font-semibold tracking-wide transition-all duration-200 hover:border-impact-medium/60 hover:bg-secondary active:scale-[0.98] ${
                premium ? "" : "text-muted-foreground"
              }`}
            >
              {premium ? (
                <Sparkles className="size-3.5 text-impact-medium transition-transform duration-300 group-hover:rotate-12" />
              ) : (
                <Lock className="size-3.5 text-muted-foreground" />
              )}
              AI Mission Breakdown
            </button>
            {premium && (
              <span className="rounded-full border border-success/40 px-2.5 py-1 text-[10px] font-semibold tracking-wider text-success uppercase">
                {tier === "lifetime" ? "Lifetime" : "Premium"}
              </span>
            )}
          </div>

        </section>

        {/* 2. THE PRIORITY MATRIX */}
        <section className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div key={tier.key} className="card-surface flex flex-col p-4">
              <div className="flex items-center gap-2 px-1 pb-3">
                <span className={`size-2 rounded-full ${tier.accentClass}`} />
                <h2 className={`text-xs font-semibold tracking-[0.2em] uppercase ${tier.textClass}`}>
                  {tier.label}
                </h2>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {state.tasks[tier.key].filter((t) => t.done).length}/{state.tasks[tier.key].length}
                </span>
              </div>

              <ul className="flex flex-1 flex-col gap-1.5">
                {state.tasks[tier.key].map((task) => (
                  <TaskRow key={task.id} task={task} onToggle={() => toggleTask(tier.key, task.id)} onRemove={() => removeTask(tier.key, task.id)} />
                ))}
                {state.tasks[tier.key].length === 0 && (
                  <li className="px-1 py-2 text-xs text-muted-foreground/60">Nothing here yet.</li>
                )}
              </ul>

              <div
                className={`mt-3 flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 transition-colors ${tier.borderClass}`}
              >
                <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  value={drafts[tier.key]}
                  onChange={(e) => setDrafts((d) => ({ ...d, [tier.key]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addTask(tier.key)}
                  placeholder={tier.placeholder}
                  className="h-9 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
          ))}
        </section>

        {/* 3. THE DAILY ACTION STEP */}
        <section
          className={`card-surface p-6 transition-all duration-700 sm:p-8 ${state.daily.done ? "success-glow" : ""}`}
        >
          <label
            htmlFor="daily-action"
            className="text-[11px] font-semibold tracking-[0.28em] text-muted-foreground uppercase"
          >
            Today's One Action
          </label>

          <div className="mt-4 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={toggleDaily}
              disabled={!hydrated || !state.daily.text.trim()}
              aria-pressed={state.daily.done}
              className={`group flex shrink-0 items-center justify-center rounded-2xl border-2 transition-all duration-300 ${
                state.daily.done
                  ? "size-16 border-success bg-success shadow-[0_0_28px_color-mix(in_oklab,var(--color-success)_40%,transparent)] sm:size-20"
                  : "size-16 border-input hover:border-foreground/60 disabled:opacity-40 sm:size-20"
              } ${justCompleted ? "animate-task-pop" : ""}`}
            >
              <Check
                className={`size-8 transition-all duration-200 sm:size-10 ${
                  state.daily.done ? "scale-100 text-background" : "scale-50 text-transparent group-hover:text-muted-foreground/40"
                }`}
                strokeWidth={3}
              />
            </button>

            <input
              id="daily-action"
              value={dailyDraft}
              onChange={(e) => setDailyDraft(e.target.value)}
              onBlur={commitDailyText}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder="Define the single most important action for today…"
              disabled={state.daily.done}
              className={`w-full bg-transparent font-display text-xl font-semibold tracking-tight outline-none transition-all duration-300 placeholder:text-muted-foreground/40 sm:text-2xl ${
                state.daily.done ? "text-muted-foreground line-through decoration-2" : "text-foreground"
              }`}
            />
          </div>

          {/* Streak counter + reset timer */}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
            <div className={`flex size-9 items-center justify-center rounded-lg bg-secondary ${state.streak.count > 0 ? "animate-streak" : ""}`}>
              <Flame className={`size-4.5 ${state.streak.count > 0 ? "text-impact-medium" : "text-muted-foreground"}`} />
            </div>
            <div>
              <div className="font-display text-lg font-bold tabular-nums">
                {state.streak.count} day{state.streak.count === 1 ? "" : "s"}
              </div>
              <div className="text-xs text-muted-foreground">
                {state.streak.count > 0 ? "Consecutive days with a completed action" : "Complete today's action to start a streak"}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2.5 rounded-lg bg-secondary px-3 py-2">
              <TimerReset className="size-4 text-muted-foreground" />
              <div>
                <div className="font-display text-sm font-semibold tabular-nums">
                  {resetMs === null ? "--:--:--" : formatCountdown(resetMs)}
                </div>
                <div className="text-[10px] tracking-wider text-muted-foreground uppercase">until daily reset</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <PaywallModal
        open={paywall !== null}
        reason={paywall ?? ""}
        onClose={() => setPaywall(null)}
        onUpgrade={handleUpgrade}
      />

      <MissionCoach
        premium={premium}
        onLockedHistory={() =>
          setPaywall(
            "Your full coach history is a premium feature. Upgrade to keep every conversation with your Mission Coach.",
          )
        }
      />
    </div>

  );
}

export const Route = createFileRoute("/app")({
    component: ApexMission,
});