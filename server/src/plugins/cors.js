import fp from "fastify-plugin";
import cors from "@fastify/cors";

export default fp(async (app) => {
  const origin = process.env.WEB_ORIGIN || "http://localhost:5173";
  await app.register(cors, {
    origin: origin.split(",").map((s) => s.trim()),
    credentials: true,
  });
}, { name: "cors" });
