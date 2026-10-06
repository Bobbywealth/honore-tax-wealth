/**
 * Minimal in-memory stand-ins for the Drizzle query builder.
 *
 * The application only ever uses a handful of builder shapes, so the tests
 * model exactly those rather than pulling in a full fake ORM. Nothing here
 * touches a real database or the network.
 */

export type InsertCall = { table: unknown; values: Record<string, unknown> };
export type DeleteCall = { table: unknown };
export type ExecuteCall = { sql: unknown };

export class FakeDb {
  /** Rows returned by the next `.select()...limit()` chain. */
  selectRows: unknown[] = [];
  inserts: InsertCall[] = [];
  deletes: DeleteCall[] = [];
  updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  executes: ExecuteCall[] = [];
  /**
   * Rows returned by `execute()`. Raw SQL helpers such as the rate limiter read
   * a count back out of RETURNING, so the fake must be able to produce rows
   * rather than resolving to undefined.
   */
  executeRows: unknown[] = [];
  /** When set, every awaited builder call rejects with this error. */
  failWith: Error | null = null;

  private chain() {
    const self = this;
    const chain = {
      from(_table: unknown) {
        return chain;
      },
      innerJoin(_table: unknown, _cond: unknown) {
        return chain;
      },
      leftJoin(_table: unknown, _cond: unknown) {
        return chain;
      },
      where(_cond: unknown) {
        return chain;
      },
      limit(_n: number) {
        return self.settle(self.selectRows);
      },
    };
    return chain;
  }

  private async settle<T>(value: T): Promise<T> {
    if (this.failWith) throw this.failWith;
    return value;
  }

  select(_fields?: unknown) {
    return this.chain();
  }

  insert(table: unknown) {
    const self = this;
    return {
      values: async (values: Record<string, unknown>) => {
        if (self.failWith) throw self.failWith;
        self.inserts.push({ table, values });
      },
    };
  }

  /** Used by lockout counters, session revocation and watermark bumps. */
  update(table: unknown) {
    const self = this;
    return {
      set(values: Record<string, unknown>) {
        return {
          where: async (_cond: unknown) => {
            if (self.failWith) throw self.failWith;
            self.updates.push({ table, values });
          },
        };
      },
    };
  }

  delete(table: unknown) {
    const self = this;
    return {
      where: async (_cond: unknown) => {
        if (self.failWith) throw self.failWith;
        self.deletes.push({ table });
      },
    };
  }

  execute(sql: unknown) {
    const self = this;
    return this.settle(
      (async () => {
        self.executes.push({ sql });
        return self.executeRows;
      })(),
    );
  }

  reset() {
    this.selectRows = [];
    this.inserts = [];
    this.deletes = [];
    this.updates = [];
    this.executes = [];
    this.executeRows = [];
    this.failWith = null;
  }
}

/** A fake `next/headers` cookie store that records writes. */
export class FakeCookieStore {
  entries = new Map<string, string>();
  setCalls: Array<{ name: string; value: string; options?: Record<string, unknown> }> = [];

  get(name: string) {
    const value = this.entries.get(name);
    return value === undefined ? undefined : { name, value };
  }

  set(name: string, value: string, options?: Record<string, unknown>) {
    this.entries.set(name, value);
    this.setCalls.push({ name, value, options });
    return this;
  }

  delete(name: string) {
    this.entries.delete(name);
    return this;
  }

  reset() {
    this.entries.clear();
    this.setCalls = [];
  }
}

/**
 * Build a Request carrying a JSON body.
 *
 * `content-length` is set explicitly so the 4000-byte guard in the
 * consultation route is exercised the same way a real platform sets it.
 */
export function jsonRequest(
  body: unknown,
  { ip = "203.0.113.10", contentLength }: { ip?: string; contentLength?: number } = {},
): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const headers = new Headers({
    "content-type": "application/json",
    "x-forwarded-for": ip,
  });
  headers.set("content-length", String(contentLength ?? raw.length));
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers,
    body: raw,
  });
}

/** A valid consultation payload; override individual fields per test. */
export function validConsultation(overrides: Record<string, unknown> = {}) {
  return {
    name: "Dana Rivers",
    email: "dana@example.com",
    phone: "555 010 0100",
    service: "Tax planning",
    message: "I would like to discuss a rental property.",
    ...overrides,
  };
}

/**
 * Shared singleton.
 *
 * Route modules call `getDb()` at request time, so every test file that mocks
 * `@/db` can return this one instance and then assert against it directly. It
 * must be a singleton rather than a per-file instance, otherwise a test would
 * be inspecting a different object from the one the route used.
 */
export const fakeDb = new FakeDb();

/** Shared cookie-store singleton, for the same reason as `fakeDb`. */
export const fakeCookies = new FakeCookieStore();

/** Reset all shared fakes between tests. */
export function resetFakes() {
  fakeDb.reset();
  fakeCookies.reset();
}