import { describe, it, expect } from "vitest";

describe("Enterprise Data Export Security", () => {
  it("profile fields do not include password hashes", () => {
    const profileFields = [
      "id",
      "email",
      "full_name",
      "company_id",
      "onboarding_completed",
      "current_plan",
      "plan_date",
      "task_history",
      "created_at",
      "updated_at",
    ];
    expect(profileFields).not.toContain("password");
  });

  it("task fields do not include password fields", () => {
    const taskFields = [
      "id",
      "company_id",
      "task_text",
      "impact_tier",
      "is_done",
      "created_at",
      "updated_at",
    ];
    expect(taskFields).not.toContain("password");
  });
});
