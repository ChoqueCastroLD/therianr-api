import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { sendWelcomeEmail, sendResetEmail } from "../lib/email";

const USERNAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
const MAX_PHOTO_INCLUDES = {
  theriotypes: true,
  photos: { orderBy: { order: "asc" as const } },
  shifts: true,
};

function excludePassword(user: any) {
  const { passwordHash, ...rest } = user;
  return rest;
}

export const authRoutes = new Elysia({ prefix: "/auth" })
  .post(
    "/register",
    async ({ body, jwt, set }: any) => {
      const { email, username, password, birthDate } = body;
      const normalizedEmail = email.trim().toLowerCase();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        set.status = 400;
        return { error: "Invalid email format" };
      }

      const trimmedUsername = username.trim();
      if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
        set.status = 400;
        return { error: "Username must be between 3 and 30 characters" };
      }

      if (!USERNAME_REGEX.test(trimmedUsername)) {
        set.status = 400;
        return { error: "Username can only contain letters, numbers, underscores, dots and hyphens" };
      }

      if (password.length < 6) {
        set.status = 400;
        return { error: "Password must be at least 6 characters" };
      }

      const birth = new Date(birthDate);
      if (isNaN(birth.getTime())) {
        set.status = 400;
        return { error: "Invalid birth date" };
      }

      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }

      if (age < 13) {
        set.status = 400;
        return { error: "You must be at least 13 years old to register" };
      }

      const existingEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existingEmail) {
        set.status = 409;
        return { error: "Email already in use" };
      }

      const existingUsername = await prisma.user.findUnique({ where: { username: trimmedUsername } });
      if (existingUsername) {
        set.status = 409;
        return { error: "Username already taken" };
      }

      const passwordHash = await Bun.password.hash(password);

      let user;
      try {
        user = await prisma.user.create({
          data: {
            email: normalizedEmail,
            username: trimmedUsername,
            passwordHash,
            birthDate: birth,
          },
          include: MAX_PHOTO_INCLUDES,
        });
      } catch (e: any) {
        // Handle race condition: another request created the same email/username between our check and insert
        if (e.code === "P2002") {
          set.status = 409;
          return { error: "Email or username already taken" };
        }
        throw e;
      }

      const token = await jwt.sign({ sub: user.id });

      // Send welcome email (fire and forget)
      sendWelcomeEmail(normalizedEmail, trimmedUsername);

      return { token, user: excludePassword(user) };
    },
    {
      body: t.Object({
        email: t.String(),
        username: t.String(),
        password: t.String(),
        birthDate: t.String(),
      }),
    }
  )
  .post(
    "/login",
    async ({ body, jwt, set }: any) => {
      const normalizedEmail = body.email.trim().toLowerCase();

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: MAX_PHOTO_INCLUDES,
      });
      if (!user) {
        set.status = 401;
        return { error: "Invalid email or password" };
      }

      const valid = await Bun.password.verify(body.password, user.passwordHash);
      if (!valid) {
        set.status = 401;
        return { error: "Invalid email or password" };
      }

      const token = await jwt.sign({ sub: user.id });

      return { token, user: excludePassword(user) };
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String(),
      }),
    }
  )
  .post(
    "/forgot-password",
    async ({ body, jwt }: any) => {
      const normalizedEmail = body.email.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

      if (user) {
        const resetToken = await jwt.sign({ sub: user.id, type: "reset", exp: Math.floor(Date.now() / 1000) + 3600 });
        const resetLink = `https://therianr.com/#/reset-password?token=${resetToken}`;
        sendResetEmail(user.email, user.username, resetLink);
      }

      return { success: true };
    },
    {
      body: t.Object({
        email: t.String(),
      }),
    }
  )
  .post(
    "/reset-password",
    async ({ body, jwt, set }: any) => {
      const { token, password } = body;

      const payload = await jwt.verify(token);
      if (!payload || !payload.sub || payload.type !== "reset") {
        set.status = 400;
        return { error: "Invalid or expired reset token" };
      }

      if (password.length < 6) {
        set.status = 400;
        return { error: "Password must be at least 6 characters" };
      }

      const passwordHash = await Bun.password.hash(password);
      await prisma.user.update({
        where: { id: payload.sub as string },
        data: { passwordHash },
      });

      return { success: true };
    },
    {
      body: t.Object({
        token: t.String(),
        password: t.String(),
      }),
    }
  );
