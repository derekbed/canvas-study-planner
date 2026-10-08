# Course Health Summary: Implementation Plan

## Goal

Create a compact, trustworthy health summary for every course that answers three questions at a glance:

1. What needs attention now?
2. Is the workload manageable over the next one to two weeks?
3. Is the student keeping up with submissions, announcements, and grades?

The feature should help a student decide what to do next in seconds. It should complement Canvas rather than replace Canvas, use the data already collected by Coursewise, and remain useful when some data is unavailable.

## Product principles

- **Action first:** Every warning should lead to a clear next action, such as opening an assignment or reviewing an announcement.
- **Explainable:** Never show a mysterious score. Show the contributing signals and their time windows.
- **Calm by default:** Use neutral language and restrained color. Reserve red for an urgent, actionable problem.
- **Comparable:** Give every course the same summary structure so students can scan across courses.
- **Honest about uncertainty:** Distinguish “no issues found” from “not enough data.”
- **Efficient:** Calculate from already extracted local data, cache results, and avoid extra Canvas requests during ordinary browsing.
- **Accessible:** Do not communicate status by color alone; support keyboard, screen readers, reduced motion, and narrow screens.

## Where it should appear

### Primary placement: course cards

Add a small “Course health” row near the existing grade and next-deadline information on each dashboard card. In Horizontal View, place it in the title/details region so the image remains visually dominant and the row does not increase card height. In Card View and List View, use the same component with responsive wrapping.

The compact row should contain:

- a text status such as `On track`, `Watch`, or `Needs attention`;
- one short supporting phrase, for example `2 deadlines this week`;
- an optional count badge for urgent items.

The entire row should be a button or link that opens the detailed course summary. Do not make the row look like a warning banner when the course is healthy.

### Detail surface: course health popover or drawer

Clicking the card row opens a lightweight popover on desktop and a bottom sheet on small screens. Keep the student on the dashboard and preserve the current card view. The surface should show:

- course name and current status;
- a one-sentence explanation of the status;
- four signal tiles: deadlines, submissions, announcements, and grade trend;
- a prioritized “Next actions” list with direct Canvas links;
- “View course in Canvas” as the primary escape hatch;
- the timestamp of the last successful sync and a refresh action when appropriate.

Use a stable width, clear hierarchy, generous spacing, and short labels. Avoid charts unless they clarify a trend; a small sparkline or progress indicator is enough for the first release.

### Secondary placement: organizer rail

Add a compact course-health indicator beside each course filter or course group in the organizer rail. This should be a scan aid only and should open the same detail surface. Do not duplicate the entire summary in the rail.

### Optional overview later

After the per-course experience is validated, add an “All courses” health overview at the top of the organizer. It should rank courses by recommended attention, show the next action for each, and allow filtering by status. This is a follow-up milestone, not a dependency for the first release.

## Health model

Use a transparent 0–100 attention score internally, but present a small set of human-readable statuses:

| Status | Meaning | Default presentation |
| --- | --- | --- |
| On track | No material risk detected in the available data | Teal/green indicator and calm copy |
| Watch | A manageable cluster, missing context, or deteriorating signal exists | Amber indicator and one recommended action |
| Needs attention | An overdue, missing, or high-impact issue requires action | Red indicator, urgent item first |
| Limited data | The course has insufficient recent data to judge reliably | Neutral indicator and explanation |

Calculate the score from independent signals so the result can be explained:

- **Deadline load (0–30):** overdue items, deadlines in the next 48 hours, and unusually dense workload in the next 7–14 days;
- **Submission health (0–30):** missing submissions, late submissions, and unsubmitted work near its deadline;
- **Communication health (0–15):** unread or recent important announcements, with recency decay;
- **Grade trend (0–20):** recent performance compared with the student’s prior course performance when sufficient graded work exists;
- **Data confidence (0–5):** freshness and completeness of the extracted data.

The exact weights should be configuration constants, documented in code, and covered by fixtures. Do not infer a grade trend from one assignment. Do not penalize a course for missing grade data when Canvas has not published grades.

### Signal rules

- Overdue work always appears before lower-severity signals.
- A single overdue item can produce `Needs attention` when it is recent or high point value.
- Several deadlines within a short window can produce `Watch` even when nothing is overdue.
- Unread announcements should become actionable only when they are recent or marked important by Canvas.
- Grade trend should be labeled `Not enough graded work` until a minimum sample size is met.
- If the last sync is stale, show the stale state inside the detail surface and avoid confident language.

## Data contract

Create a normalized course-health object rather than calculating directly in rendering code:

```js
{
  courseId,
  status: "on-track" | "watch" | "needs-attention" | "limited-data",
  score,
  confidence,
  summary,
  signals: {
    deadlines: { status, count, overdue, next, windowLabel },
    submissions: { status, missing, late, unsubmitted },
    announcements: { status, unread, recent, latest },
    grades: { status, average, trend, sampleSize }
  },
  actions: [{ id, label, reason, href, priority }],
  generatedAt,
  sourceUpdatedAt
}
```

Keep raw Canvas extraction separate from derived health calculations. This makes the model testable, lets future views reuse it, and prevents visual components from depending on Canvas-specific markup.

## Implementation sequence

### Phase 1: inventory and extraction

1. Audit the existing extraction and storage paths in `extension/insights-model.js`, `extension/insights.js`, and the background broker.
2. Identify which fields already exist for deadlines, submissions, announcements, grades, and sync timestamps.
3. Add normalized fields only where necessary; avoid new network calls if existing Canvas data is sufficient.
4. Add fixtures for healthy, overdue, clustered-deadline, missing-grade, empty-course, and stale-data courses.

### Phase 2: pure health engine

1. Add a small pure module, such as `extension/course-health.js`, with no DOM or Canvas dependencies.
2. Implement signal calculators, score aggregation, status thresholds, confidence rules, and action ranking.
3. Make dates timezone-safe and use the student’s local timezone for labels.
4. Return stable reasons and labels so UI copy does not drift between views.
5. Add unit tests for each signal, threshold boundary, missing field, stale sync, and mixed-severity case.

### Phase 3: shared UI component

1. Build one Course Health Summary component in the existing content-script style.
2. Render the compact card row and detailed popover/drawer from the same model.
3. Use semantic buttons, dialog labeling, focus trapping, Escape-to-close, and focus restoration.
4. Add loading, empty, limited-data, stale, and error states without shifting the card layout.
5. Ensure the component inherits the existing light, custom-color, and dark theme variables in `appearance.css`.

### Phase 4: placement and interaction

1. Add the compact row to Card View, List View, and Horizontal View through shared selectors and view-specific layout rules.
2. Add the indicator to the organizer rail without duplicating health calculations.
3. Link every action directly to the relevant Canvas assignment, announcement, or course page.
4. Keep the feature hidden when no course identifier is available rather than rendering a broken placeholder.
5. Add a small settings control only if users need to disable the summary; do not add another persistent toolbar control for the first release.

### Phase 5: polish and validation

1. Check desktop, narrow viewport, zoomed text, dark mode, custom light palettes, and Canvas tray overlays.
2. Verify that card heights and the existing horizontal image/title proportions do not change unexpectedly.
3. Test keyboard-only navigation and a screen reader pass for status, counts, and action labels.
4. Measure render cost across a dashboard with many courses; calculate once per normalized data update and memoize by course ID plus source timestamp.
5. Run the existing extension test suite and add visual checks for each card view.

## Copy and interaction guidelines

Use direct, specific language:

- `On track · 1 deadline this week`
- `Watch · 3 deadlines in the next 7 days`
- `Needs attention · 1 overdue assignment`
- `Limited data · No recent grades available`

Inside the detail surface, explain the status in one sentence, then show the most useful action first. Avoid phrases such as “risk score,” “algorithm,” or “everything is fine.” Do not show a numeric score unless an advanced details affordance is later validated with users.

## Privacy and safety

- Keep derived health data local to the extension unless the user explicitly enables a future sync feature.
- Never send grades, assignment names, or announcement text to a third-party service for this feature.
- Escape all Canvas-derived text before inserting it into the DOM.
- Treat Canvas links as navigation targets and preserve the current origin.
- Make clear that the summary is an organizational aid and does not change Canvas submissions or grades.

## Definition of done

The first release is complete when:

- every visible course card has a compact, readable health state;
- the detail surface explains the state with at least one useful next action;
- Card, List, and Horizontal views share the same calculations and copy;
- missing, stale, and unavailable data are represented honestly;
- light, custom light, and dark themes remain visually consistent across the page and navigation trays;
- all primary interactions work by keyboard and with assistive technology;
- unit, integration, and visual checks cover the scoring boundaries and all major UI states;
- rendering remains fast on a dashboard containing at least 20 courses.

## Suggested rollout

Ship behind a local feature flag or preference first. Start with deadlines and submission health, then add announcements and grade trends after the normalized model is stable. Observe which actions students open and which statuses they understand before adding more metrics or a cross-course ranking view.
