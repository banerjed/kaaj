export type WorkflowStatus =
  "draft" | "pending" | "approved" | "rejected" | "applied" | "cancelled"

export interface WorkflowTransitionAttempt {
  from: WorkflowStatus
  to: WorkflowStatus
  actorPermissions: string[]
  isCurrentApprover: boolean
  approvalAlreadyApplied: boolean
  workflowVersion: string | null
  auditEvents: string[]
}

export interface ExternalCallback {
  providerEventId: string
  operationId: string
  status: "accepted" | "succeeded" | "failed"
}

export interface NotificationActionAttempt {
  actionEndpointUsed: boolean
  linkExpired: boolean
  actorAuthorized: boolean
  replayed: boolean
}

const allowedTransitions: Record<WorkflowStatus, WorkflowStatus[]> = {
  draft: ["pending", "cancelled"],
  pending: ["approved", "rejected", "cancelled"],
  approved: ["applied", "cancelled"],
  rejected: [],
  applied: [],
  cancelled: [],
}

export function canTransitionWorkflow(
  attempt: WorkflowTransitionAttempt,
): boolean {
  if (!allowedTransitions[attempt.from].includes(attempt.to)) {
    return false
  }

  if (attempt.workflowVersion === null) {
    return false
  }

  if (attempt.to === "approved") {
    return (
      attempt.isCurrentApprover &&
      !attempt.approvalAlreadyApplied &&
      attempt.actorPermissions.includes("workflow:approve") &&
      attempt.auditEvents.includes("workflow.transition.approved")
    )
  }

  if (attempt.to === "applied") {
    return (
      attempt.actorPermissions.includes("workflow:apply") &&
      attempt.auditEvents.includes("workflow.transition.applied")
    )
  }

  return attempt.auditEvents.includes("workflow.transition.requested")
}

export function uniqueExternalCallbacks(
  callbacks: ExternalCallback[],
): ExternalCallback[] {
  const seen = new Set<string>()

  return callbacks.filter((callback) => {
    if (seen.has(callback.providerEventId)) {
      return false
    }

    seen.add(callback.providerEventId)
    return true
  })
}

export function notificationActionCanMutateState(
  attempt: NotificationActionAttempt,
): boolean {
  return (
    attempt.actionEndpointUsed &&
    !attempt.linkExpired &&
    attempt.actorAuthorized &&
    !attempt.replayed
  )
}
