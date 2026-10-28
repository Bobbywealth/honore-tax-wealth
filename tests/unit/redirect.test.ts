import { describe, expect, it } from "vitest";
import { seeOther } from "@/lib/redirect";

describe("seeOther", () => {
  it("returns a 303 with a relative Location so the browser keeps the public host", () => {
    const res = seeOther("/dashboard/admin/tasks?created=1");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/dashboard/admin/tasks?created=1");
  });

  it("never emits the internal bind address", () => {
    expect(seeOther("/dashboard/admin/team").headers.get("location")).not.toContain("0.0.0.0");
  });

  it.each(["//evil.example/x", "https://evil.example", "javascript:alert(1)", "/\\evil.example", ""])(
    "falls back to / for a non-path target %s",
    (target) => {
      expect(seeOther(target).headers.get("location")).toBe("/");
    },
  );
});
