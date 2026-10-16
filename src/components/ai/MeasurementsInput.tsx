import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { analyzeTrends, METRICS, type MetricKey, type MetricTrend } from "@/lib/aiAssistant";

export type MeasurementValues = Partial<Record<MetricKey, string>>;

/**
 * Optional vital-signs form shown to the doctor while writing a prescription.
 * Shows the patient's previous value next to each field for comparison.
 */
const MeasurementsInput = ({
  patientId,
  values,
  onChange,
}: {
  patientId: string | undefined;
  values: MeasurementValues;
  onChange: (v: MeasurementValues) => void;
}) => {
  const [previous, setPrevious] = useState<Partial<Record<MetricKey, MetricTrend>>>({});

  useEffect(() => {
    if (!patientId) return;
    supabase
      .from("health_measurements")
      .select("metric, value, measured_at")
      .eq("patient_id", patientId)
      .order("measured_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        const map: Partial<Record<MetricKey, MetricTrend>> = {};
        for (const tr of analyzeTrends(data ?? [])) map[tr.metric] = tr;
        setPrevious(map);
      });
  }, [patientId]);

  const inputClass =
    "w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="w-4 h-4 text-primary" />
        <label className="text-sm font-semibold text-foreground">Ko'rik ko'rsatkichlari</label>
        <span className="text-xs text-muted-foreground">(ixtiyoriy)</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Kiritilgan qiymatlar bemorning "Salomatligim" sahifasida grafik bo'lib chiqadi va AI ularni oldingi ko'riklar bilan taqqoslaydi.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {METRICS.map((m) => {
          const prev = previous[m.key];
          return (
            <div key={m.key}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {m.label.uz} <span className="opacity-70">({m.unit})</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                step={m.step}
                min={m.plausible[0]}
                max={m.plausible[1]}
                value={values[m.key] ?? ""}
                onChange={(e) => onChange({ ...values, [m.key]: e.target.value })}
                placeholder={m.normal ? `${m.normal[0]}–${m.normal[1]}` : ""}
                className={inputClass}
              />
              {prev && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Oldingi: {prev.latest} ({new Date(prev.latestAt).toLocaleDateString()})
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MeasurementsInput;
