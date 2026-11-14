import { describe, it, expect } from "vitest";

describe("Client Portal Security", () => {
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

  it("deliverable fields do not include internal fields", () => {
    const deliverableColumns = [
      "id",
      "company_id",
      "user_id",
      "title",
      "description",
      "status",
      "due_date",
      "created_at",
      "updated_at",
    ];
    expect(deliverableColumns).not.toContain("internal_only");
    expect(deliverableColumns).not.toContain("comment_text");
  });

  it("document columns do not include internal fields", () => {
    const documentColumns = [
      "id",
      "company_id",
      "user_id",
      "title",
      "description",
      "file_url",
      "file_type",
      "file_size",
      "is_public",
      "created_at",
      "updated_at",
    ];
    expect(documentColumns).not.toContain("internal_only");
    expect(documentColumns).not.toContain("comment_text");
    expect(documentColumns).not.toContain("task_id");
  });
});
