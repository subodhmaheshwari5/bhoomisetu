import { test } from "node:test";
import assert from "node:assert/strict";
import { apiFetch, loginAs, DEMO_EMAILS } from "./helpers.js";
import type { AIChatResponse } from "../src/types/index.js";

/**
 * These tests pin down the two regressions that made the Copilot useless:
 *  1. the drawer was mounted with an empty context, so no case data was loaded
 *  2. several intents had no data-retrieval branch, so the local provider fell
 *     through to a "prototype mode" stub instead of answering from records.
 */

const CASE_DELAY_QUESTION = "Why is this case delayed?";

test("AI Copilot", async (t) => {
  const adminToken = await loginAs(DEMO_EMAILS.superAdmin);

  // Fetch a real case id so the test exercises the actual authorized-data path.
  const casesRes = await apiFetch<Array<{ id: string; caseNumber: string }>>("/cases", { token: adminToken });
  assert.equal(casesRes.status, 200);
  const seededCase = casesRes.body.data?.[0];
  assert.ok(seededCase, "seed data should contain at least one case");

  await t.test("chat requires authentication", async () => {
    const res = await apiFetch("/ai/chat", { method: "POST", body: { message: "hello" } });
    assert.equal(res.status, 401);
  });

  await t.test("chat rejects an empty message", async () => {
    const res = await apiFetch("/ai/chat", { method: "POST", token: adminToken, body: { message: "   " } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, "INVALID_MESSAGE");
  });

  await t.test("a case-scoped question answers from authorized case data", async () => {
    const res = await apiFetch<AIChatResponse>("/ai/chat", {
      method: "POST",
      token: adminToken,
      body: {
        message: CASE_DELAY_QUESTION,
        context: { page: "case-details", caseId: seededCase.id, caseNumber: seededCase.caseNumber },
      },
    });

    assert.equal(res.status, 200);
    const data = res.body.data;
    assert.ok(data, "response envelope should carry data");
    assert.equal(typeof data.message, "string");
    assert.ok(data.message.length > 0, "message must not be empty");

    // The old bug returned this stub text on every question.
    assert.ok(
      !/prototype mode with a local AI provider/i.test(data.message),
      "response must not return the prototype-mode stub",
    );

    // The response must be grounded in the requested case.
    assert.equal(data.contextUsed?.caseId, seededCase.id);
    assert.ok(
      (data.sources?.length ?? 0) > 0,
      "a case-scoped question must cite at least one source",
    );
    assert.ok(
      data.sources?.some((s) => s.type === "case"),
      "expected a case source",
    );
    assert.ok(data.message.includes(seededCase.caseNumber), "answer should reference the case number");
    assert.ok(data.disclaimer, "response should carry the disclaimer");
  });

  await t.test("response envelope matches what the frontend expects", async () => {
    // apiPost() unwraps { success, data }, so the frontend reads data.message.
    const res = await apiFetch<AIChatResponse>("/ai/chat", {
      method: "POST",
      token: adminToken,
      body: { message: "What stage is this case in?", context: { caseId: seededCase.id } },
    });

    assert.equal(res.body.success, true);
    assert.deepEqual(Object.keys(res.body.data ?? {}).sort(), [
      "contextUsed",
      "disclaimer",
      "intent",
      "message",
      "sources",
      "suggestedActions",
    ].sort());
  });

  await t.test("notification questions no longer return the prototype stub", async () => {
    const res = await apiFetch<AIChatResponse>("/ai/chat", {
      method: "POST",
      token: adminToken,
      body: { message: "Summarize my notifications", context: { page: "dashboard" } },
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.data);
    assert.ok(
      !/prototype mode/i.test(res.body.data.message),
      "notification summary must not return the prototype-mode stub",
    );
    assert.equal(res.body.data.intent, "NOTIFICATION_SUMMARY");
  });

  await t.test("dashboard questions return aggregates and citations", async () => {
    const res = await apiFetch<AIChatResponse>("/ai/chat", {
      method: "POST",
      token: adminToken,
      body: { message: "What needs attention today?", context: { page: "dashboard" } },
    });

    assert.equal(res.status, 200);
    const message = res.body.data?.message ?? "";
    assert.ok(/DASHBOARD SNAPSHOT/i.test(message), "expected dashboard KPIs");
    assert.ok(/Total Cases/i.test(message), "expected total case count");
    assert.ok(!/prototype mode/i.test(message));
  });

  await t.test("an unrelated question explains itself instead of claiming prototype mode", async () => {
    const res = await apiFetch<AIChatResponse>("/ai/chat", {
      method: "POST",
      token: adminToken,
      body: { message: "zzzz qqqq", context: { page: "dashboard" } },
    });

    assert.equal(res.status, 200);
    assert.ok(
      !/prototype mode/i.test(res.body.data?.message ?? ""),
      "must not claim prototype mode",
    );
  });

  await t.test("case context the user is not authorized for is refused", async () => {
    const res = await apiFetch<AIChatResponse>("/ai/chat", {
      method: "POST",
      token: adminToken,
      body: {
        message: "Show me this case",
        context: { caseId: "00000000-0000-0000-0000-000000000000" },
      },
    });

    assert.equal(res.status, 200);
    assert.match(res.body.data?.message ?? "", /not authorized/i);
    assert.equal(res.body.data?.sources?.length ?? 0, 0);
  });

  await t.test("suggested prompts are read from the POST body", async () => {
    const res = await apiFetch<string[]>("/ai/suggested-prompts", {
      method: "POST",
      token: adminToken,
      body: { context: { caseId: seededCase.id } },
    });

    assert.equal(res.status, 200);
    const prompts = res.body.data ?? [];
    assert.ok(prompts.length > 0, "expected suggested prompts");
    assert.ok(
      prompts.some((p) => /delay/i.test(p)),
      "case context should yield case-specific prompts",
    );
  });

  await t.test("suggested prompts fall back to generic questions with no context", async () => {
    const res = await apiFetch<string[]>("/ai/suggested-prompts", {
      method: "POST",
      token: adminToken,
      body: { context: {} },
    });

    assert.equal(res.status, 200);
    assert.ok((res.body.data ?? []).length > 0);
  });
});
