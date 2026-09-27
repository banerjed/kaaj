import type { Tx } from "../db/tenant"

export const STAGE_TYPES = ["open", "won", "lost"] as const
export type StageType = (typeof STAGE_TYPES)[number]

export type PipelineStage = {
  id: string
  name: string
  sort_order: number
  stage_type: StageType
  is_active: boolean
}

export async function list(tx: Tx): Promise<PipelineStage[]> {
  return tx<PipelineStage[]>`
    SELECT id, name, sort_order, stage_type, is_active
      FROM crm_pipeline_stages
     WHERE is_active
     ORDER BY sort_order ASC
  `
}
