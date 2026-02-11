import { Brain, Camera, Flame, Clock } from "lucide-react";

interface StatsProps {
  totalMemories: number;
  totalCaptures: number;
  categoryCounts: Record<string, number>;
  recentCaptureDate: string | null;
}

export function MemoryStats({
  totalMemories,
  totalCaptures,
  categoryCounts,
  recentCaptureDate,
}: StatsProps) {
  const topCategory = Object.entries(categoryCounts).sort(
    ([, a], [, b]) => b - a
  )[0];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        icon={<Brain className="h-5 w-5" />}
        label="Memories"
        value={totalMemories.toString()}
      />
      <StatCard
        icon={<Camera className="h-5 w-5" />}
        label="Captures"
        value={totalCaptures.toString()}
      />
      <StatCard
        icon={<Flame className="h-5 w-5" />}
        label="Top Category"
        value={topCategory ? topCategory[0] : "—"}
      />
      <StatCard
        icon={<Clock className="h-5 w-5" />}
        label="Last Capture"
        value={
          recentCaptureDate
            ? new Date(recentCaptureDate).toLocaleDateString()
            : "Never"
        }
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-ember-border-subtle bg-ember-surface p-4 transition-shadow duration-500 hover:shadow-ember-card-hover">
      <div className="text-ember-amber">{icon}</div>
      <p className="mt-2 font-display text-2xl font-bold text-ember-text">
        {value}
      </p>
      <p className="text-xs text-ember-text-muted">{label}</p>
    </div>
  );
}
