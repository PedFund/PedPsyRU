import type {SyntheticRegistrationReceipt} from "../../src/ports/registration-receipt.js";
import {PostgresRegistrationReceipt} from "../../src/adapters/postgres/registration-receipt.js";
// @ts-expect-error A test receipt is never a claim of real mailbox ownership.
export const realReceipt:SyntheticRegistrationReceipt={synthetic:false,confirmation_token:"synthetic",expires_at:1000};
// @ts-expect-error No contact/diagnostic fields in the public test receipt.
export const privateReceipt:SyntheticRegistrationReceipt={synthetic:true,confirmation_token:"synthetic",expires_at:1000,email:"a@example.test"};
// @ts-expect-error Opt-in is mandatory, not an omitted/default production mode.
new PostgresRegistrationReceipt({} as never,{} as never);
// @ts-expect-error A false flag cannot enable the synthetic receiver.
new PostgresRegistrationReceipt({} as never,{} as never,false);
