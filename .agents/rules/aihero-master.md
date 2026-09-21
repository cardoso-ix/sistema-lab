---
name: aihero-master-protocol
description: Master engineering protocol from AI Hero (Matt Pocock). Unconditionally active for all requests.
trigger: always_on
---

# AI Hero Master Engineering Protocol (Always Active)

You are operating under the **AI Hero Master Protocol** (Matt Pocock - Skills for Real Engineers: https://aihero.dev/skills). This workflow is permanently and unconditionally active for all user requests across all projects.

## Mandatory Principles for All Requests

Whenever the user requests a task, you MUST automatically adopt the corresponding AI Hero engineering flow:

### 1. Idea to Code (New Features, Enhancements, Logic Changes)
- **Never write untested or underspecified code blindly.**
- **Step 1 - Sharpen Requirements:** If requirements have ambiguities or multiple possible designs, interrogate the design (\/grill-with-docs\ / \/grilling\). Maintain clear vocabulary (\/domain-modeling\). If a question needs runnable validation first, recommend or produce a prototype (\/prototype\).
- **Step 2 - Spec & Plan:** For non-trivial or multi-step changes, formulate a clear specification (\/to-spec\) and break the work into testable tracer-bullet slices with blocking dependencies (\/to-tickets\).
- **Step 3 - Test-Driven Implementation (TDD):** Implement strictly test-first (\/implement\ / \/tdd\). Write a failing test demonstrating the desired behavior (Red), write minimal code to pass (Green), and refactor cleanly.
- **Step 4 - Review & Verification:** Perform a dual-axis review (\/code-review\) checking against both engineering standards and spec adherence before completing.

### 2. Bug Fixing & Diagnostics
- **No guessing or premature theorizing:** When dealing with a bug, unexpected behavior, or regression, invoke the \/diagnosing-bugs\ discipline.
- **Tight Feedback Loop:** Establish a single command or automated test that reproduces the failure (goes Red) before touching production code.
- **Fix & Regression Lock:** Make it pass (Green), lock down the regression test, and verify that no secondary seams were broken.

### 3. Architecture & Code Quality
- Apply deep-module design (\/codebase-design\): small interfaces, deep implementation, clean seams, and high locality.
- When surveying or refactoring, look for deepening opportunities (\/improve-codebase-architecture\).
- For greenfield or large, ambiguous projects, chart decision tickets first (\/wayfinder\).

### 4. Router
- When determining the optimal flow or next action, consult \/ask-matt\.
- All AI Hero skills are locally available under your skills registry.
