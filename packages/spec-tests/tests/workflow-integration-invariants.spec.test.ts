import { describe, expect, it } from "vitest"
import {
  canTransitionWorkflow,
  notificationActionCanMutateState,
  uniqueExternalCallbacks,
} from "../src/workflow.js"

describe("INV-WF-001 state transitions are valid", () => {
  it("allows a current approver to approve a pending workflow once with audit and version", () => {
    expect(
      canTransitionWorkflow({
        from: "pending",
        to: "approved",
        actorPermissions: ["workflow:approve"],
        isCurrentApprover: true,
        approvalAlreadyApplied: false,
        workflowVersion: "benefits-election-v3",
        auditEvents: ["workflow.transition.approved"],
      }),
    ).toBe(true)
  })

  it("rejects invalid transitions and double approvals", () => {
    expect(
      canTransitionWorkflow({
        from: "rejected",
        to: "applied",
        actorPermissions: ["workflow:apply"],
        isCurrentApprover: true,
        approvalAlreadyApplied: false,
        workflowVersion: "change-request-v2",
        auditEvents: ["workflow.transition.applied"],
      }),
    ).toBe(false)

    expect(
      canTransitionWorkflow({
        from: "pending",
        to: "approved",
        actorPermissions: ["workflow:approve"],
        isCurrentApprover: true,
        approvalAlreadyApplied: true,
        workflowVersion: "change-request-v2",
        auditEvents: ["workflow.transition.approved"],
      }),
    ).toBe(false)
  })

  it("rejects historical workflow execution without a pinned workflow version", () => {
    expect(
      canTransitionWorkflow({
        from: "pending",
        to: "approved",
        actorPermissions: ["workflow:approve"],
        isCurrentApprover: true,
        approvalAlreadyApplied: false,
        workflowVersion: null,
        auditEvents: ["workflow.transition.approved"],
      }),
    ).toBe(false)
  })
})

describe("INV-WF-002 external calls are idempotent", () => {
  it("dedupes replayed provider callbacks by provider event id", () => {
    expect(
      uniqueExternalCallbacks([
        {
          providerEventId: "evt_001",
          operationId: "ach-batch-001",
          status: "succeeded",
        },
        {
          providerEventId: "evt_001",
          operationId: "ach-batch-001",
          status: "succeeded",
        },
        {
          providerEventId: "evt_002",
          operationId: "ach-batch-001",
          status: "failed",
        },
      ]),
    ).toEqual([
      {
        providerEventId: "evt_001",
        operationId: "ach-batch-001",
        status: "succeeded",
      },
      {
        providerEventId: "evt_002",
        operationId: "ach-batch-001",
        status: "failed",
      },
    ])
  })
})

describe("INV-WF-003 notifications do not become source of truth", () => {
  it("allows mutation only through an authorized non-expired action endpoint", () => {
    expect(
      notificationActionCanMutateState({
        actionEndpointUsed: true,
        linkExpired: false,
        actorAuthorized: true,
        replayed: false,
      }),
    ).toBe(true)
  })

  it("blocks expired, unauthorized, replayed, or notification-only actions", () => {
    for (const attempt of [
      {
        actionEndpointUsed: false,
        linkExpired: false,
        actorAuthorized: true,
        replayed: false,
      },
      {
        actionEndpointUsed: true,
        linkExpired: true,
        actorAuthorized: true,
        replayed: false,
      },
      {
        actionEndpointUsed: true,
        linkExpired: false,
        actorAuthorized: false,
        replayed: false,
      },
      {
        actionEndpointUsed: true,
        linkExpired: false,
        actorAuthorized: true,
        replayed: true,
      },
    ]) {
      expect(notificationActionCanMutateState(attempt)).toBe(false)
    }
  })
})
