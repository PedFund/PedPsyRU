import type {RegistrationBrowser} from "../../src/ports/registration-browser.js";
import type {LoginSession} from "../../src/ports/identity.js";
// @ts-expect-error A preauth cookie helper is not a participant/staff session.
export const session:LoginSession={} as RegistrationBrowser;
