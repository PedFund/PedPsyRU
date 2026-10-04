// Pre-authentication browser protection is NOT a participant/staff session.
export interface RegistrationBrowser {
  create():string;
  valid(token:string):boolean;
  expiresAt(token:string):number;
  csrf(token:string):string;
  assert(token:string,csrf:string):void;
}
export interface RegistrationDenials {record(reason:string):Promise<void>}
