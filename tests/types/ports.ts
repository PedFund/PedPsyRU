import type {ParticipantContext, DraftInput} from "../../src/ports/participation.js";
import type {TkiRequest} from "../../core/tki-contract.js";
export const participant: ParticipantContext = {
  realm: "participant", actorId: "synthetic", studyId: "synthetic", participantId: "synthetic",
  sessionId: "synthetic", sessionVersion: 1
};
// @ts-expect-error Staff must not write on behalf of a participant.
export const staff: ParticipantContext = {...participant, realm: "staff"};
// @ts-expect-error Only canonical A/B or string1..7 values belong in the internal contract; Cyrillic lookalikes are rejected.
export const invalidDraft: DraftInput = {expected_revision: 0, current_item_id: "q01", responses: [{item_id: "q01", value: "А"}]};
// @ts-expect-error The removed key/version must not compile as a pinned request.
export const invalidVersion: TkiRequest = {contract_version: "1.0", method_version_id: "legacy", handler_version: "tki-contract-0.3.0", responses: []};
