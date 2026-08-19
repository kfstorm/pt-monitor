import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { METRIC_KEYS, METRICS, type MetricKey } from "@/lib/metrics";
import { cn } from "@/lib/utils";

interface MetricSelectorProps {
  value: MetricKey;
  onValueChange: (key: MetricKey) => void;
  className?: string;
}

export function MetricSelector({
  value,
  onValueChange,
  className,
}: MetricSelectorProps) {
  const { t } = useTranslation();

  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as MetricKey)}>
      <SelectTrigger
        className={cn("w-44", className)}
        aria-label={t("chart.trendMetric")}
      >
        <SelectValue>{t(METRICS[value].label)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {METRIC_KEYS.map((key) => (
          <SelectItem key={key} value={key}>
            {t(METRICS[key].label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
