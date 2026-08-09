# Scholarly AI: Alpha & Beta Evaluation Protocol

## Overview
This document outlines the evaluation strategy for the Human-in-the-Loop (HITL) Alpha and Beta phases. As per our core directives, we do not simulate user feedback. This protocol will be activated when real cohorts are onboarded to validate the subjective and objective effectiveness of the AI Intelligence Layer.

## Phase 1: Internal Alpha (Team & Stakeholders)
**Audience**: Internal developers, QA engineers, and domain experts (teachers).
**Duration**: 2 Weeks
**Objective**: Dogfood the application to find glaring UX friction, critical hallucinations, and infrastructure bottlenecks.

### Success Criteria for Alpha Exit
1. Zero P0 security vulnerabilities discovered.
2. 95%+ Uptime on the RAG and Vector generation pipelines.
3. No severe regressions in the core chat UX (latency < 2 seconds for first token).
4. Stakeholder approval on subjective teaching tone (Socratic vs Direct).

## Phase 2: Closed Beta (Targeted Cohorts)
**Audience**: 500-1000 selected students specifically preparing for NEET, JEE, and UPSC exams.
**Duration**: 4 Weeks
**Objective**: Evaluate the system's ability to retain context across long study sessions, assess the effectiveness of the Bloom's Taxonomy dynamic shifting, and validate the accuracy of the Knowledge Graph extraction from real, unstructured student notes.

### Metrics Captured
*   **Engagement**: Average session length, Daily Active Users (DAU), messages per session.
*   **Feedback**: Thumbs Up/Down ratios via the `/api/chat/feedback` endpoint.
*   **Subjective**: CSAT survey triggered after 5 sessions focusing on "Did the AI understand your weak areas?"
*   **Objective**: Reduction in repeated questions, correct mapping of student intents (measured via telemetry).

### Success Criteria for Beta Exit
1. Positive feedback ratio > 85%.
2. Average session length > 15 minutes.
3. Bloom's Taxonomy shifts triggered accurately in > 80% of sessions.

## Phase 3: Open Usability Testing
**Audience**: General public sign-ups with gradual rollout.
**Duration**: Ongoing
**Objective**: Final stress test of the Auto-Scaling infrastructure and broad validation of the UX/UI across varied devices and network conditions.

### Metrics Captured
*   **Infrastructure**: Latency under peak load, Firebase read/write costs per active user.
*   **UX Friction**: Time-to-first-value (e.g., how quickly a user completes their first quiz or schedule).

## Operational Feedback Loop
All feedback during these phases will flow through the `ChatController.handleFeedback` endpoint, directly into the `MetricsEngine` and Datadog/Cloud Logging dashboards for real-time visibility.

> [!CAUTION]
> Do not proceed to General Availability (GA) until the Beta Exit Criteria are met with statistically significant data from real users.
