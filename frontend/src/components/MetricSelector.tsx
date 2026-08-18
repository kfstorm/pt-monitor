import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { METRIC_KEYS, METRICS, type MetricKey } from "@/lib/metrics";

interface MetricSelectorProps {
  value: MetricKey;
  onValueChange: (key: MetricKey) => void;
}

export function MetricSelector({ value, onValueChange }: MetricSelectorProps) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next as MetricKey)}>
      <SelectTrigger className="w-44" aria-label="Trend metric">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {METRIC_KEYS.map((key) => (
          <SelectItem key={key} value={key}>
            {METRICS[key].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}