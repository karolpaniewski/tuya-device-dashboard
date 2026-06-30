<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->

## ORM & Auth patterns

### Drizzle ORM (not Prisma)

This project uses Drizzle ORM with libsql. Never use Prisma syntax.

Schema definition:
```ts
// src/server/db/schema.ts
export const eventLog = sqliteTable("event_log", {
  id:        integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  eventType: text("event_type").notNull(),
  payload:   text("payload").notNull(),
});
```

Query pattern:
```ts
import { db } from "~/server/db";
import { eventLog } from "~/server/db/schema";
import { desc, gte } from "drizzle-orm";

const rows = await db
  .select()
  .from(eventLog)
  .where(gte(eventLog.createdAt, since))
  .orderBy(desc(eventLog.createdAt))
  .limit(200);
```

Insert (fire-and-forget, isolated):
```ts
try {
  await db.insert(eventLog).values({ eventType: "threshold_breach", payload: JSON.stringify(data) });
} catch {
  // intentionally swallowed — event log write must never block the caller
}
```

### NextAuth v5 (Auth.js v5 beta)

This project uses next-auth@5 (Auth.js v5 beta), NOT v4. The API surface changed.

Session access in Server Components / Route Handlers:
```ts
import { auth } from "~/server/auth";

const session = await auth();
if (!session?.user) redirect("/login");
```

Do NOT use `getServerSession()` — that is NextAuth v4. Do NOT import from `next-auth/react` for server-side auth checks.

Client-side session (Client Components only):
```ts
import { useSession } from "next-auth/react";
const { data: session } = useSession();
```

### Zod version pin

This project uses **Zod v3** (`zod@3.x`). Do NOT use Zod v4 APIs.

Zod v4 introduced breaking changes to error handling and type inference.
Use only Zod v3 patterns: `z.object()`, `z.string()`, `.parse()`, `.safeParse()`, `z.infer<typeof schema>`.
