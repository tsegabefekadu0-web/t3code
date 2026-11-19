import { expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import { OrchestratorToolkit } from "./tools.ts";

// Oversized page sizes clamp on decode, so the schema has no `maximum`; Codex also drops
// bounds from its TypeScript view. The description is the only place a model sees a limit.
it("states t3_thread_read page size limits in the parameter descriptions", () => {
  const schema = Tool.getJsonSchema(OrchestratorToolkit.tools.t3_thread_read) as {
    readonly properties: Readonly<Record<string, { readonly description?: string }>>;
  };
  const limits = { limit: "100", runLimit: "50", maxCharsPerItem: "20000" };
  for (const [name, maximum] of Object.entries(limits)) {
    expect(schema.properties[name]?.description, name).toContain(maximum);
  }
});

it("refuses a t3_thread_update whose fields do not fit its action", () => {
  const decode = Schema.decodeUnknownExit(
    OrchestratorToolkit.tools.t3_thread_update.parametersSchema,
  );
  expect(Exit.isFailure(decode({ action: "rename" }))).toBe(true);
  expect(Exit.isFailure(decode({ action: "regenerate_title", title: "New" }))).toBe(true);
  expect(Exit.isSuccess(decode({ action: "rename", title: "New", environmentId: undefined }))).toBe(
    true,
  );
});

it("lets provider_usage filter to one instance and refresh, and nothing else", () => {
  const decode = Schema.decodeUnknownExit(
    OrchestratorToolkit.tools.provider_usage.parametersSchema,
  );
  expect(Exit.isSuccess(decode({ environmentId: undefined }))).toBe(true);
  expect(Exit.isSuccess(decode({ providerInstanceId: "opencode-go", refresh: true }))).toBe(true);
  expect(Exit.isFailure(decode({ refresh: "yes" }))).toBe(true);
  expect(Exit.isFailure(decode({ providerInstanceId: "" }))).toBe(true);
});

it("advertises provider_usage as read-only", () => {
  const tool = OrchestratorToolkit.tools.provider_usage;
  expect(tool.description).toContain("plan limits");
  expect(tool.description).toContain("observed usage");
  expect(Context.get(tool.annotations, Tool.Readonly)).toBe(true);
});
