interface MorningCheckInProps {
    mission: string;
    dailyAction: string;
    onClose: () => void;
}

export function MorningCheckIn({
    mission,
    dailyAction,
    onClose,
}: MorningCheckInProps) {
    return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90">
      <div className="max-w-md rounded-xl border p-6 text-center">
        <h1 className="text-3xl font-bold">
            ☀️ Good Morning
        </h1>

        <p className="mt-4">
            Mission:
        </p>

        <p className="font-semibold">
            {mission}
        </p>

        <p className="mt-6">
            Today's One Action:
        </p>

        <p className="font-bold">
            {dailyAction}
        </p>

        <button
            onClick={onClose}
            className="mt-6 rounded-lg border px-4 py-2"
        >
            Start Day
          </button>
       </div>
     </div>
   );
}