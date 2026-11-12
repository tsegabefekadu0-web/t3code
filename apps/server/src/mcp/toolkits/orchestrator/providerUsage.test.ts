import { expect, it } from "@effect/vitest";
import {
  OrchestratorMcpProviderUsage,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type ServerProviderUsageLimits,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { needsObservedUsage, providerUsageEntry } from "./providerUsage.ts";

const now = Date.parse("2026-11-12T12:00:00.000Z");

function provider(overrides: Partial<ServerProvider> = {}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make("codex"),
    driver: ProviderDriverKind.make("codex"),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-11-12T11:58:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    ...overrides,
  };
}

const limits = (overrides: Partial<ServerProviderUsageLimits> = {}): ServerProviderUsageLimits => ({
  checkedAt: "2026-11-12T11:58:00.000Z",
  windows: [
    {
      id: "five_hour",
      kind: "session",
      label: "Session",
      usedPercent: 37.6,
      resetsAt: "2026-11-12T14:30:00.000Z",
      windowDurationMins: 300,
    },
  ],
  ...overrides,
});

it("reports a window's percent left, reset time, and age", () => {
  const entry = providerUsageEntry({
    provider: provider({
      displayName: "Work Codex",
      auth: { status: "authenticated", label: "Pro" },
      usageLimits: limits(),
    }),
    now,
  });

  expect(entry.status).toBe("ok");
  expect(entry.notice).toBeNull();
  expect(entry.plan).toBe("Pro");
  expect(entry.displayName).toBe("Work Codex");
  expect(entry.fetchedAt).toBe("2026-11-12T11:58:00.000Z");
  expect(entry.ageSeconds).toBe(120);
  expect(entry.stale).toBe(false);
  expect(entry.windows[0]).toEqual({
    id: "five_hour",
    kind: "session",
    label: "Session",
    usedPercent: 37.6,
    remainingPercent: 62,
    resetsAt: "2026-11-12T14:30:00.000Z",
    resetsIn: "resets in 2h 30m",
    windowDurationMins: 300,
  });
});

it("marks limits stale once they are older than the probe interval explains", () => {
  const entry = providerUsageEntry({
    provider: provider({ usageLimits: limits({ checkedAt: "2026-11-12T11:20:00.000Z" }) }),
    now,
  });

  expect(entry.ageSeconds).toBe(2_400);
  expect(entry.stale).toBe(true);
});

it("keeps an unsupported provider's reason instead of inventing windows", () => {
  const entry = providerUsageEntry({
    provider: provider({
      driver: ProviderDriverKind.make("opencode"),
      usageLimits: {
        checkedAt: "2026-11-12T11:58:00.000Z",
        windows: [],
        unavailable: { reason: "unsupported" },
      },
    }),
    now,
  });

  expect(entry.status).toBe("unsupported");
  expect(entry.windows).toEqual([]);
  expect(entry.notice).toBe("This account has no subscription limits.");
  expect(needsObservedUsage(entry)).toBe(true);
});

it("distinguishes a failed probe and a provider that reports nothing", () => {
  const failed = providerUsageEntry({
    provider: provider({
      usageLimits: {
        checkedAt: "2026-11-12T11:58:00.000Z",
        windows: [],
        unavailable: { reason: "probeFailed" },
      },
    }),
    now,
  });
  const silent = providerUsageEntry({ provider: provider(), now });

  expect(failed.status).toBe("probe_failed");
  expect(failed.fetchedAt).toBe("2026-11-12T11:58:00.000Z");
  expect(silent.status).toBe("no_limits");
  expect(silent.fetchedAt).toBeNull();
  expect(silent.ageSeconds).toBeNull();
  expect(silent.stale).toBe(false);
  expect(needsObservedUsage(silent)).toBe(false);
});

it("decodes the entry against the tool's result schema", () => {
  const decode = Schema.decodeUnknownSync(OrchestratorMcpProviderUsage);
  const entry = providerUsageEntry({ provider: provider({ usageLimits: limits() }), now });
  expect(decode(entry).windows).toHaveLength(1);
});
