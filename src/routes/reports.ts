import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { authGuard } from "../lib/auth";

const VALID_REASONS = ["zoophilia", "harassment", "minor", "fake", "spam", "other"];

export const reportRoutes = new Elysia({ prefix: "/reports" })
  .use(authGuard)
  .post(
    "/",
    async ({ userId, body, set }: any) => {
      const { targetId, reason, details } = body;

      if (!VALID_REASONS.includes(reason)) {
        set.status = 400;
        return {
          error: `Invalid reason. Must be one of: ${VALID_REASONS.join(", ")}`,
        };
      }

      if (targetId === userId) {
        set.status = 400;
        return { error: "Cannot report yourself" };
      }

      // Verify target user exists
      const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
      if (!targetUser) {
        set.status = 404;
        return { error: "Target user not found" };
      }

      const report = await prisma.report.create({
        data: {
          reporterId: userId,
          targetId,
          reason,
          details: details || null,
        },
      });

      return { success: true, id: report.id };
    },
    {
      body: t.Object({
        targetId: t.String(),
        reason: t.String({ maxLength: 50 }),
        details: t.Optional(t.String({ maxLength: 1000 })),
      }),
    }
  );
