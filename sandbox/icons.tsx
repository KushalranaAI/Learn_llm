// Icon for a component kind (catalog stores icon names as strings so it stays server-safe).
import Icon, { type IconName } from "@/components/ui/Icon";
import { KINDS } from "./catalog";
import type { NodeKind } from "./types";

export function KindIcon({ kind, size = 16 }: { kind: NodeKind; size?: number }) {
  return <Icon name={(KINDS[kind]?.icon ?? "boxes") as IconName} size={size} />;
}
