import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { authGuard } from "../lib/auth";

export const blockRoutes = new Elysia({ prefix: "/blocks" })
  .use(authGuard)
  .post(
    "/",
    async ({ userId, body, set }: any) => {
      const { targetId } = body;

      if (targetId === userId) {
        set.status = 400;
        return { error: "Cannot block yourself" };
      }

      try {
        await prisma.block.create({
          data: { blockerId: userId, blockedId: targetId },
        });
      } catch (e: any) {
        if (e.code === "P2002") {
          set.status = 409;
          return { error: "User already blocked" };
        }
        throw e;
      }

      // Delete any existing match between the two users
      const [a, b] = userId < targetId ? [userId, targetId] : [targetId, userId];
      await prisma.match.deleteMany({
        where: {
          OR: [
            { userAId: a, userBId: b },
            { userAId: b, userBId: a },
          ],
        },
      });

      return { success: true };
    },
    {
      body: t.Object({
        targetId: t.String(),
      }),
    }
  )
  .delete("/:targetId", async ({ userId, params, set }: any) => {
    const { targetId } = params;

    const deleted = await prisma.block.deleteMany({
      where: { blockerId: userId, blockedId: targetId },
    });

    if (deleted.count === 0) {
      set.status = 404;
      return { error: "Block not found" };
    }

    return { success: true };
  })
  .get("/", async ({ userId }: any) => {
    const blocks = await prisma.block.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    return blocks.map((b) => ({
      id: b.id,
      blockedUser: b.blocked,
    }));
  });
