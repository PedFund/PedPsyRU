import type {InstrumentRequest,InstrumentResponse,InstrumentResult} from "../ports/instruments.js";
import {calculatePinnedInstrument} from "../scoring/instruments.js";
import {ParticipationError} from "../ports/errors.js";
import {validateDraft, validateRevision} from "../ports/validation.js";
import type {ParticipantContext, UnitOfWork, StoredResult} from "../ports/participation.js";

export interface ParticipationDependencies {
  readonly newId: () => string;
  readonly now: () => string;
  readonly digest: (itemIds: readonly string[], responses: readonly InstrumentResponse[]) => string;
  readonly score?: (input: InstrumentRequest) => InstrumentResult;
}
export function createParticipationService(uow: UnitOfWork, dependencies: ParticipationDependencies) {
  const score = dependencies.score ?? calculatePinnedInstrument;
  return {
    read(context: ParticipantContext, id: string) {
      return uow.run(context, async ports => {
        const state = await ports.attempts.getAuthorized(id);
        if (!state) throw new ParticipationError(404, "NOT_AVAILABLE");
        await ports.audit.appendRequired({event: "draft_read", resourceId: id});
        return state;
      });
    },
    save(context: ParticipantContext, id: string, input: unknown) {
      return uow.run(context, async ports => {
        const state = await ports.attempts.getAuthorized(id);
        if (!state) throw new ParticipationError(404, "NOT_AVAILABLE");
        if (state.status !== "draft") throw new ParticipationError(409, "ATTEMPT_COMPLETED");
        const release = await ports.releases.getPinned(state.releaseId);
        validateDraft(input, release.itemIds,release.choiceValues);
        const result = await ports.attempts.compareAndSave(id, input);
        await ports.audit.appendRequired({event: "draft_saved", resourceId: id});
        return result;
      });
    },
    complete(context: ParticipantContext, id: string, input: unknown) {
      return uow.run(context, async ports => {
        const state = await ports.attempts.getAuthorized(id);
        if (!state) throw new ParticipationError(404, "NOT_AVAILABLE");
        validateRevision(input);
        if (state.status === "completed") {
          const existing = await ports.results.getExisting(id);
          if (!existing) throw new ParticipationError(503, "RESULT_STATE_INVALID");
          await ports.audit.appendRequired({event: "attempt_completed", resourceId: id});
          return existing;
        }
        if (state.revision !== input.expected_revision) throw new ParticipationError(409, "REVISION_CONFLICT");
        const release = await ports.releases.getPinned(state.releaseId);
        if (state.responses.length !== release.itemIds.length) throw new ParticipationError(422, "INCOMPLETE_RESPONSES");
        const payload = score({contract_version: release.contractVersion, method_version_id: release.methodVersionId,
          handler_version: release.handlerVersion, responses: state.responses});
        if (payload.status !== "scored" || payload.contract_version !== release.contractVersion ||
          payload.method_version_id !== release.methodVersionId || payload.handler_version !== release.handlerVersion ||
          payload.calculation.key_digest !== release.keyDigest || !payload.quality.complete || !payload.quality.usable_for_aggregation)
          throw new ParticipationError(422, "SCORING_REJECTED");
        const result: StoredResult = {id: dependencies.newId(), attemptId: id, inputRevision: state.revision,
          responsesDigest: dependencies.digest(release.itemIds, state.responses), calculatedAt: dependencies.now(), payload};
        const stored = await ports.results.insertOnce(result);
        await ports.attempts.markCompleted(id, state.revision, stored.id, stored.calculatedAt);
        await ports.audit.appendRequired({event: "attempt_completed", resourceId: id});
        return stored;
      });
    },
    result(context: ParticipantContext, id: string) {
      return uow.run(context, async ports => {
        const state = await ports.attempts.getAuthorized(id);
        if (!state) throw new ParticipationError(404, "NOT_AVAILABLE");
        if (state.status !== "completed") throw new ParticipationError(409, "RESULT_NOT_READY");
        const result = await ports.results.getExisting(id);
        if (!result) throw new ParticipationError(503, "RESULT_STATE_INVALID");
        await ports.audit.appendRequired({event: "result_read", resourceId: id});
        return result;
      });
    }
  };
}
