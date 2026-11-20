import { describe, it, expect } from "vitest";
import { authenticate, createAccount, findUser, AuthError } from "../src/lib/accounts";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../src/data/demo-data";

describe("demo accounts", () => {
  it("sign in with the published password, case-insensitively by email", async () => {
    const u = await authenticate([], "  Demo@CaseClarity.ai ", DEMO_PASSWORD);
    expect(u).toMatchObject({ name: "Alex Rivera", role: "senior_case_worker", roleLabel: "Senior Case Worker" });
    const cw = await authenticate([], DEMO_ACCOUNTS[1].email, DEMO_PASSWORD);
    expect(cw.role).toBe("case_worker");
  });

  it("reject a wrong password", async () => {
    await expect(authenticate([], DEMO_ACCOUNTS[0].email, "nope")).rejects.toBeInstanceOf(AuthError);
  });
});

describe("accounts created in the browser", () => {
  it("store a bcrypt hash, never the password, and can sign in afterwards", async () => {
    const { accounts, user } = await createAccount([], { name: "Sam", email: "Sam@Example.org", password: "longenough1", org: "" }, "u1");
    expect(user).toMatchObject({ id: "u1", email: "sam@example.org", role: "case_worker", org: "Northside Legal Aid" });
    expect(JSON.stringify(accounts)).not.toContain("longenough1");
    expect(accounts[0].passwordHash.startsWith("$2")).toBe(true);
    expect((await authenticate(accounts, "sam@example.org", "longenough1")).id).toBe("u1");
    await expect(authenticate(accounts, "sam@example.org", "wrong-password")).rejects.toThrow("Invalid email or password.");
    expect(findUser(accounts, "u1")?.name).toBe("Sam");
    expect(findUser(accounts, "u-demo")?.name).toBe("Alex Rivera");
    expect(findUser(accounts, "gone")).toBeNull();
  });

  it("validate email, password length and duplicates (including the demo emails)", async () => {
    await expect(createAccount([], { name: "", email: "bad", password: "longenough1", org: "" }, "x")).rejects.toThrow(/valid email/);
    await expect(createAccount([], { name: "", email: "a@b.co", password: "short", org: "" }, "x")).rejects.toThrow(/at least 8/);
    await expect(createAccount([], { name: "", email: DEMO_ACCOUNTS[0].email, password: "longenough1", org: "" }, "x")).rejects.toThrow(/already exists/);
  });
});
