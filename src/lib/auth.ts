import { Elysia } from "elysia";
import { prisma } from "./prisma";

export const authGuard = new Elysia({ name: "authGuard" })
  .derive(async ({ jwt, bearer, set }: any) => {
    const token = bearer;
    if (!token) {
      set.status = 401;
      throw new Error("Unauthorized");
    }

    const payload = await jwt.verify(token);
    if (!payload || !payload.sub) {
      set.status = 401;
      throw new Error("Invalid token");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub as string },
    });

    if (!user) {
      set.status = 401;
      throw new Error("User not found");
    }

    return { userId: payload.sub as string };
  });
