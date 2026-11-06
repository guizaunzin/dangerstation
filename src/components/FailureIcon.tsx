import type { FailureId } from "@/sim/types";
import { IconBatteryWarn, IconBolt, IconDrop, IconFilter, IconFlame, IconMeteor, IconSnow, IconSun } from "./Icons";

const MAP: Record<FailureId, typeof IconBolt> = {
  generator: IconBolt,
  cooling: IconSnow,
  leak: IconDrop,
  solar: IconSun,
  fire: IconFlame,
  scrubber: IconFilter,
  battery: IconBatteryWarn,
  meteor: IconMeteor,
};

export function FailureIcon({ id, title }: { id: FailureId; title?: string }) {
  const Icon = MAP[id];
  return <Icon title={title} />;
}
