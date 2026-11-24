// Shared VU iteration for the questionnaire scenarios (exam / stress / spike /
// soak). State is module-level and therefore isolated per k6 VU.
import {check, sleep} from "k6";
import {Counter} from "k6/metrics";
import {json, loginParticipant, newSession, request, PASSWORD} from "./common.js";

const attempts = JSON.parse(open("../fixtures/attempts.json"));

export function createExam(thinkMin, thinkMax, offset = 0, source = attempts) {
  let session = null, participant = null, form = null, draft = null, cursor = 0, failures = 0;
  const conflict = new Counter("draft_revision_conflict");
  const rejected = new Counter("draft_rejected");

  function readState() {
    const formResponse = request(session, "GET", `/api/v2/participant/attempts/${participant.attempt_id}/form`, undefined, {tags: {name: "Form"}});
    const draftResponse = request(session, "GET", `/api/v2/participant/attempts/${participant.attempt_id}`, undefined, {tags: {name: "DraftRead"}});
    form = json(formResponse);
    draft = json(draftResponse);
  }

  function ensureSession() {
    if (!(session && session.csrf)) {
      participant = source[(offset + __VU - 1) % source.length];
      session = newSession();
      const login = loginParticipant(session, participant.email, PASSWORD);
      if (login.response.status !== 200 || !session.csrf) { session = null; return false; }
    }
    if (!form || !draft) readState();
    // A failed read under load is not an authentication failure: keep the
    // session and retry, instead of minting a new login for every retry.
    return Boolean(form && Array.isArray(form.items) && draft && Array.isArray(draft.responses));
  }

  return function iteration() {
    if (!ensureSession()) { sleep(1 + Math.random() * 2); return; }
    const item = form.items[cursor % form.items.length];
    cursor++;
    const responses = draft.responses.map(r => ({item_id: r.item_id, value: r.value}));
    const existing = responses.find(r => r.item_id === item.id);
    if (existing) existing.value = item.options[cursor % item.options.length].value;
    else responses.push({item_id: item.id, value: item.options[0].value});

    const saved = request(session, "PUT", `/api/v2/participant/attempts/${participant.attempt_id}/draft`,
      {expected_revision: draft.revision, current_item_id: item.id, responses}, {tags: {name: "SaveDraft"}});
    check(saved, {"draft saved": r => r.status === 200});
    if (saved.status === 200) {
      draft = json(saved);
    } else if (saved.status === 409) {
      conflict.add(1);
      const reread = json(request(session, "GET", `/api/v2/participant/attempts/${participant.attempt_id}`, undefined, {tags: {name: "DraftRead"}}));
      draft = reread && Array.isArray(reread.responses) ? reread : null;
    } else {
      rejected.add(1);
      failures++;
      if (saved.status === 401) session = null;
    }
    sleep(thinkMin + Math.random() * (thinkMax - thinkMin));
  };
}
