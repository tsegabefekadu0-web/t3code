import {
  type OrchestratorMcpObservedUsage,
  type OrchestratorMcpProviderUsage,
  type OrchestratorMcpProviderUsageWindow,
  type ServerProvider,
  type ServerProviderUsageLimits,
} from "@t3tools/contracts";
import { PROVIDER_USAGE_STALE_AFTER_MS, remainingPercent } from "@t3tools/shared/usageLimits";
import { formatResetsIn, limitsNotice } from "@t3tools/shared/usageLimitsCopy";

function usageStatus(limits: ServerProviderUsageLimits | undefined) {
  if (limits === undefined) return "no_limits" as const;
  if (limits.unavailable?.reason === "unsupported") return "unsupported" as const;
  if (limits.unavailable?.reason === "probeFailed") return "probe_failed" as const;
  return limits.windows.length === 0 ? ("no_limits" as const) : ("ok" as const);
}

function usageWindow(
  window: ServerProviderUsageLimits["windows"][number],
  now: number,
): OrchestratorMcpProviderUsageWindow {
  return {
    id: window.id,
    kind: window.kind,
    label: window.label,
    usedPercent: window.usedPercent,
    remainingPercent: remainingPercent(window),
    resetsAt: window.resetsAt ?? null,
    resetsIn: formatResetsIn(window, now),
    windowDurationMins: window.windowDurationMins ?? null,
  };
}

/** One provider instance's plan limits, as the Usage screen reads them. */
export function providerUsageEntry(input: {
  readonly provider: ServerProvider;
  readonly now: number;
  readonly observed?: OrchestratorMcpObservedUsage;
}): OrchestratorMcpProviderUsage {
  const { provider, now } = input;
  const limits = provider.usageLimits;
  const checkedAt = limits?.checkedAt;
  const fetchedAtMs = checkedAt === undefined ? NaN : Date.parse(checkedAt);
  const fetchedAt = Number.isFinite(fetchedAtMs) ? checkedAt : null;
  const ageMs = Number.isFinite(fetchedAtMs) ? Math.max(0, now - fetchedAtMs) : null;
  const status = usageStatus(limits);
  return {
    providerInstanceId: provider.instanceId,
    driverKind: provider.driver,
    displayName: provider.displayName ?? null,
    plan: provider.auth.label ?? null,
    status,
    notice:
      limits === undefined ? "This provider does not report plan limits." : limitsNotice(limits),
    fetchedAt: fetchedAt ?? null,
    ageSeconds: ageMs === null ? null : Math.floor(ageMs / 1000),
    stale: ageMs !== null && ageMs > PROVIDER_USAGE_STALE_AFTER_MS,
    windows: (limits?.windows ?? []).map((window) => usageWindow(window, now)),
    ...(input.observed === undefined ? {} : { observed: input.observed }),
  };
}

/** Providers whose Usage entry would otherwise show nothing at all. */
export function needsObservedUsage(entry: OrchestratorMcpProviderUsage): boolean {
  return entry.driverKind === "opencode" && entry.windows.length === 0;
}
