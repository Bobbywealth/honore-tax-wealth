/**
 * Client-facing return status.
 *
 * Clients see a simplified 6-step pipeline. They must NOT see internal
 * stages (collecting, preparing, client_review, etc.) — those are for
 * agents. This mapping is the single source of truth for what a client
 * sees on their dashboard.
 *
 * Internal (returns.stage)          -> Client-facing
 * ---------------------------------------------------------------
 * not_started                       -> Documents Received
 * collecting                        -> Documents Received
 * preparing                         -> Preparing Your Return
 * client_review                     -> Ready for Signature
 * approved                          -> Ready for Signature
 * filing                            -> Filed
 * filed                             -> Filed
 * accepted                          -> Completed
 * rejected                          -> Action Needed
 *
 * The "Action Needed" status is also used when there are open document
 * requests or unsigned forms — the caller should OR those in.
 */

export type ClientFacingStatus =
  | "Documents Received"
  | "Preparing Your Return"
  | "Action Needed"
  | "Ready for Signature"
  | "Filed"
  | "Completed";

const STAGE_MAP: Record<string, ClientFacingStatus> = {
  not_started: "Documents Received",
  collecting: "Documents Received",
  preparing: "Preparing Your Return",
  client_review: "Ready for Signature",
  approved: "Ready for Signature",
  filing: "Filed",
  filed: "Filed",
  accepted: "Completed",
  rejected: "Action Needed",
};

export function clientFacingStatus(internalStage: string): ClientFacingStatus {
  return STAGE_MAP[internalStage] ?? "Documents Received";
}

/**
 * Ordered pipeline for progress display. Index increases as the return
 * moves forward; "Action Needed" is a lateral state, not a step.
 */
export const CLIENT_PIPELINE: ClientFacingStatus[] = [
  "Documents Received",
  "Preparing Your Return",
  "Ready for Signature",
  "Filed",
  "Completed",
];

export function pipelineIndex(status: ClientFacingStatus): number {
  const i = CLIENT_PIPELINE.indexOf(status);
  return i === -1 ? 0 : i;
}
