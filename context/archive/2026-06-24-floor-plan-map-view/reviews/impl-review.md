<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Interactive 2D Floor-Plan ("Digital Twin") Map View

- **Plan**: context/changes/floor-plan-map-view/plan.md
- **Scope**: All 4 phases (full plan review)
- **Date**: 2026-06-24
- **Verdict**: REJECTED (critical security finding)
- **Findings**: 1 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Path traversal / arbitrary file write via unsanitized siteId

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/api/floor-plan/upload/route.ts:24-49
- **Detail**: `siteId` comes straight from form data and is only checked for "non-empty string" (line 27) before being interpolated into `filename = `${siteId}.${extension}`` (line 43) and joined into a disk path via `path.join(UPLOAD_DIR, filename)` (line 49). `path.join` resolves `..` segments — it does not sandbox the result. Worse: the file write (lines 47-49) happens *before* the DB existence check (lines 51-58), so an authenticated user can write an attacker-chosen PNG/JPEG to any path the node process can write to, using a crafted `siteId` like `../../../../some/path`, without ever needing a real site id.
- **Fix**: Validate the site exists *before* writing anything, and reject any `siteId` containing `/`, `\`, or `..`:
  ```ts
  if (siteId.includes("/") || siteId.includes("\\") || siteId.includes("..")) {
    return NextResponse.json({ message: "Invalid siteId" }, { status: 400 });
  }
  const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId));
  if (!site) {
    return NextResponse.json({ message: "Site not found" }, { status: 404 });
  }
  // ...then mkdir/writeFile/update, as today
  ```
  This closes the traversal vector AND fixes F5 (orphaned file on 404) as a side effect.
- **Decision**: FIXED — reordered checks in route.ts (reject `/`, `\`, `..` in siteId; confirm site exists before any disk write). Verified live: traversal payload → 400, nonexistent site → 404 with no orphan, legit upload still 200. typecheck/lint/170 tests all pass.

### F2 — map-view.tsx's floor-plan `<img>` lacks the cache-busting fix already applied to the Settings thumbnail

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/_components/map/map-view.tsx:155
- **Detail**: Commit 31b7e71 fixed this bug class in floor-plan-manager.tsx: replacing a floor plan with a same-extension file produces an identical path string, so `<img src>` never changes and the browser can keep showing a stale bitmap. map-view.tsx has no such cache-buster. Lower-probability here (Map View doesn't upload itself), but a fresh mount doesn't guarantee a fresh network fetch if the URL is byte-identical to a previously cached one.
- **Fix**: Append `?v=${activeSite.updatedAt?.getTime() ?? 0}` to the `<img src>`, using `updatedAt` from `site.list` (needs adding to the route's select, same as `floorPlanImagePath` was in Phase 2).
- **Decision**: FIXED — added `updatedAt` to `site.list`'s select (site.ts), appended `?v=` cache-buster to map-view.tsx's `<img src>`. typecheck/lint/170 tests all pass.

### F3 — setMapPosition/clearMapPosition aren't scoped by siteId

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/server/api/routers/device.ts (setMapPosition, clearMapPosition)
- **Detail**: `rename`, `move`, and `reorder` scope their `where` clause by `siteId` in addition to device id. `setMapPosition`/`clearMapPosition` only match on `eq(devices.id, input.deviceId)` — matching the *other* half of the router (`setpoint`/`setPlugState`, also unscoped). Consistent with half the existing mutations, inconsistent with the other half. Low real-world severity in this single-tenant, all-users-trusted app.
- **Fix A ⭐ Recommended**: Leave as-is, matching `setpoint`/`setPlugState` precedent
  - Strength: No behavior change; consistent with the router's established "device-scoped, not site-scoped" mutations.
  - Tradeoff: The router stays inconsistent (two scoping styles).
  - Confidence: HIGH — mirrors an existing, accepted pattern, not a new decision.
  - Blind spot: Haven't confirmed whether a future multi-tenant mode is planned that would make this matter more.
- **Fix B**: Add `and(eq(devices.id, input.deviceId), eq(devices.siteId, input.siteId))`
  - Strength: Closes the gap, matches `rename`/`move`'s stricter style.
  - Tradeoff: Requires adding `siteId` to both mutations' input schemas and to client call sites in map-view.tsx.
  - Confidence: MEDIUM — straightforward but touches 3 files for a low-severity issue.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix B — added `siteId` to both mutations' input schemas, scoped `where` by `and(eq(devices.id, ...), eq(devices.siteId, ...))` matching `rename`/`move`'s style; updated map-view.tsx call sites and device.test.ts. typecheck/lint/170 tests all pass.

### F4 — File-type check trusts client-declared MIME, not magic bytes

- **Severity**: 👁️ OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: src/lib/floor-plan-validation.ts
- **Detail**: A forged `Content-Type: image/png` on a non-image binary would pass validation and be written with a `.png` extension, then served as a static asset. Low risk given the size cap and image-only rendering context.
- **Decision**: SKIPPED — low risk given the 5MB cap and image-only rendering; not worth magic-byte sniffing complexity for this feature.

### F5 — Orphaned file when DB update finds no matching site

- **Severity**: 👁️ OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: src/app/api/floor-plan/upload/route.ts:57-58
- **Detail**: If the file write succeeds but `eq(sites.id, siteId)` matches no row, the file is left on disk with no DB pointer. Subsumed by F1's fix (check site exists before writing).
- **Decision**: RESOLVED — fixed as a side effect of F1 (site existence is now checked before any disk write).

### F6 — Orphaned file on format change during replace

- **Severity**: 👁️ OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: src/app/api/floor-plan/upload/route.ts:43-44
- **Detail**: Replacing a PNG with a JPEG (or vice versa) writes a new file under a new extension and leaves the old one on disk. Matches the plan's Non-Goal for same-extension replaces, but didn't anticipate the cross-extension case. Minor disk leak, not a data-loss or correctness issue.
- **Decision**: FIXED — route.ts now deletes any other `<siteId>.*` file before writing the new one. Verified live: replacing default.jpg with a PNG correctly removed the old file. typecheck/lint/170 tests all pass.
