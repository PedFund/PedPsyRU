import type {ParticipantGateway} from "../ports/identity.js";
import type {createParticipationService} from "./participation.js";
type Participation = ReturnType<typeof createParticipationService>;
export function createParticipantApi(identity: ParticipantGateway, service: Participation) {
  return {
    login: (input: unknown) => identity.login(input),
    session: async (token: string) => {const state=await identity.session(token);return {csrf:state.csrf,attempts:state.attempts};},
    logout: (token: string, csrf: string) => identity.logout(token,csrf),
    form: (token: string, id: string) => identity.form(token,id),
    read: async (token: string,id: string) => service.read((await identity.session(token)).context,id),
    save: async (token: string,id: string,input: unknown,csrf: string) => {
      const session=await identity.session(token);identity.assertCsrf(token,csrf);return service.save(session.context,id,input);
    },
    complete: async (token: string,id: string,input: unknown,csrf: string) => {
      const session=await identity.session(token);identity.assertCsrf(token,csrf);return service.complete(session.context,id,input);
    },
    result: async (token: string,id: string) => service.result((await identity.session(token)).context,id),
    denied: (token: string,reason: string) => identity.denied(token,reason)
  };
}
