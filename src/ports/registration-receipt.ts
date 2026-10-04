import type {RegistrationLanding} from "./participant-registration.js";

// Public metadata, not authority to choose a participant's study or group.
// Existing landing keeps its original three-field contract.
export interface RegistrationPublicContext extends RegistrationLanding {readonly study_id:string}
export interface SyntheticRegistrationReceipt {
  readonly synthetic:true;
  readonly confirmation_token:string;
  readonly expires_at:number;
}
// Explicit test delivery boundary. This is NOT proof of real mailbox ownership
// and must never be enabled for real contacts or a production mail provider.
export interface RegistrationReceipt {
  context(inviteToken:string):Promise<RegistrationPublicContext>;
  receipt(inviteToken:string,browserToken:string):Promise<SyntheticRegistrationReceipt>;
}
