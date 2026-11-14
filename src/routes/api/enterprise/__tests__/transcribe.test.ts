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
    expect(profileFields).not.toContain("password_hash");
    expect(profileFields).not.toContain("encrypted_password");
    expect(profileFields).not.toContain("raw_password");
    expect(profileFields).not.toContain("salt");
    expect(profileFields).not.toContain("auth_identity");
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
    expect(taskFields).not.toContain("password_hash");
    expect(taskFields).not.toContain("encrypted_password");
    expect(taskFields).not.toContain("salt");
  });
});
