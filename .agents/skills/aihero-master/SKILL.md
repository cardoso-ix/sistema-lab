---
name: aihero-master
description: Master orchestrator for AI Hero (Skills for Real Engineers by Matt Pocock - https://aihero.dev/skills). Routes and governs all engineering workflows including requirements interrogation, domain modeling, specification creation, tracer-bullet tickets, test-driven development (TDD), code review, and bug diagnosis.
---

# AI Hero Master Protocol (Skills for Real Engineers)

This is the master engineering protocol based on **AI Hero by Matt Pocock** (https://aihero.dev/skills). It orchestrates all engineering workflows across all projects.

## Lifecycle Stages & Skills

### 1. Requirements & Idea Sharpening (Before Writing Code)
- **/grill-with-docs**: When working in a project repository. Conducts a relentless interview to sharpen the design, producing decisions and updating \CONTEXT.md\ and ADRs.
- **/grill-me**: Stateless version of the interview when no repository context is needed.
- **/domain-modeling**: Clarifies domain language, eliminates overloaded terms, and establishes clean domain models.
- **/prototype**: When a question requires runnable exploration before deciding, create a throwaway prototype on a prototype branch.

### 2. Specification & Breakdown
- **/to-spec**: Converts conversation into an unambiguous, formal technical specification.
- **/to-tickets**: Breaks the specification down into tracer-bullet tickets with explicit blocking edges.

### 3. Implementation (Test-First)
- **/implement**: Picks up tickets or specs and executes using TDD.
- **/tdd**: Test-Driven Development core loop. Always writes the failing test first (Red), implements the minimal code to pass (Green), then refactors cleanly.

### 4. Review & Quality
- **/code-review**: Conducts a two-axis review (Standards + Specification adherence) of the diff before committing or merging.

### 5. Bugs & Regressions
- **/diagnosing-bugs**: For any bug or unexpected behavior, never speculate or guess. First create a tight feedback loop (a single command that reliably reproduces the failure), then fix with a regression test.

### 6. Architecture & Upkeep
- **/codebase-design**: Designs clean deep modules (high leverage behind small interfaces at clean seams).
- **/improve-codebase-architecture**: Surveys the codebase for deepening opportunities.
- **/wayfinder**: For huge, foggy, greenfield initiatives, charts a shared map of decision tickets.

### 7. Routing & Guidance
- **/ask-matt**: Ask which skill or flow fits your current situation.
