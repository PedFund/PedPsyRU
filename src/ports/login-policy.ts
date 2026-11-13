// Admission policy for participant password derivation. The default keeps the
// historical production limits; a pilot must opt in explicitly and is still
// bounded by the bootstrap parser and by the SQL policy arguments.
export interface ParticipantAdmissionPolicy {
  readonly globalLimit: number;
  readonly globalWindowMs: number;
  readonly derivationConcurrency: number;
  readonly queueLimit: number;
  readonly queueTimeoutMs: number;
}
export const DEFAULT_PARTICIPANT_ADMISSION: ParticipantAdmissionPolicy = Object.freeze({
  globalLimit: 30,
  globalWindowMs: 300000,
  derivationConcurrency: 1,
  queueLimit: 0,
  queueTimeoutMs: 0
});
