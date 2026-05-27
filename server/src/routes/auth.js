import bcrypt from "bcryptjs";

const LOGIN_SCHEMA = {
  body: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", format: "email", maxLength: 200 },
      password: { type: "string", minLength: 6, maxLength: 200 },
    },
  },
};

export default async function authRoutes(app) {
  app.post("/login", { schema: LOGIN_SCHEMA }, async (req, reply) => {
    const { email, password } = req.body;
    const user = await app.prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    const token = await reply.jwtSign({
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions || [],
    });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions || [],
      },
    };
  });

  app.get("/me", { preHandler: [app.authenticate] }, async (req) => {
    const userId = req.user.sub;
    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, permissions: true, createdAt: true },
    });
    return { user };
  });
}
