import Fastify, {type FastifyInstance} from "fastify";

export function createBaseApp(): FastifyInstance {
  const app = Fastify({logger: false, trustProxy: false, bodyLimit: 8192, requestTimeout: 10000, allowErrorHandlerOverride: false});
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
  });
  app.get("/health", {
    schema: {response: {200: {type: "object", additionalProperties: false,
      required: ["status"], properties: {status: {type: "string", const: "ok"}}}}}
  }, async () => ({status: "ok"}));
  return app;
}
// Health-only entry remains unchanged; data routes need explicit composition.
export function createPlatformApp(): FastifyInstance {
  const app=createBaseApp();
  app.setErrorHandler((_error,_request,reply)=>reply.code(500).send({error:"INTERNAL_ERROR"}));
  return app;
}
