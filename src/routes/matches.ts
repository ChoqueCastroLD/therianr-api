import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { authGuard } from "../lib/auth";

function excludePassword(user: any) {
  const { passwordHash, ...rest } = user;
  return rest;
}

export const matchRoutes = new Elysia({ prefix: "/matches" })
  .use(authGuard)
  .get("/", async ({ userId }: any) => {
    const matches = await prisma.match.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: {
          include: {
            theriotypes: true,
            photos: { orderBy: { order: "asc" } },
            shifts: true,
          },
        },
        userB: {
          include: {
            theriotypes: true,
            photos: { orderBy: { order: "asc" } },
            shifts: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const unreadCounts = await prisma.message.groupBy({
      by: ["matchId"],
      where: {
        matchId: { in: matches.map((m) => m.id) },
        senderId: { not: userId },
        readAt: null,
      },
      _count: true,
    });
    const unreadMap = new Map(unreadCounts.map((u) => [u.matchId, u._count]));

    const result = matches.map((match) => {
      const otherUser = match.userAId === userId ? match.userB : match.userA;
      const lastMessage = match.messages[0] || null;

      return {
        id: match.id,
        createdAt: match.createdAt,
        otherUser: excludePassword(otherUser),
        lastMessage,
        unreadCount: unreadMap.get(match.id) || 0,
      };
    });

    // Sort by most recent activity (last message or match date)
    result.sort((a, b) => {
      const dateA = a.lastMessage?.createdAt || a.createdAt;
      const dateB = b.lastMessage?.createdAt || b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return result;
  })
  .get("/:id/messages", async ({ userId, params, query, set }: any) => {
    const matchId = params.id;
    const limit = Math.min(parseInt(query.limit) || 50, 100);
    const cursor = query.cursor;

    const match = await prisma.match.findUnique({ where: { id: matchId } });

    if (!match) {
      set.status = 404;
      return { error: "Match not found" };
    }

    if (match.userAId !== userId && match.userBId !== userId) {
      set.status = 403;
      return { error: "Not authorized to view these messages" };
    }

    const where: any = { matchId };

    if (cursor) {
      const cursorMessage = await prisma.message.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });

      if (cursorMessage) {
        where.createdAt = { lt: cursorMessage.createdAt };
      }
    }

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Reverse so messages display in chronological order (oldest → newest)
    return messages.reverse();
  })
  .post(
    "/:id/messages",
    async ({ userId, params, body, set }: any) => {
      const matchId = params.id;
      const { content } = body;

      if (!content || content.trim().length === 0) {
        set.status = 400;
        return { error: "Message content cannot be empty" };
      }

      if (content.length > 2000) {
        set.status = 400;
        return { error: "Message too long. Maximum 2000 characters" };
      }

      const match = await prisma.match.findUnique({ where: { id: matchId } });

      if (!match) {
        set.status = 404;
        return { error: "Match not found" };
      }

      if (match.userAId !== userId && match.userBId !== userId) {
        set.status = 403;
        return { error: "Not authorized to send messages in this match" };
      }

      const message = await prisma.message.create({
        data: {
          matchId,
          senderId: userId,
          content: content.trim(),
        },
      });

      return message;
    },
    {
      body: t.Object({
        content: t.String(),
      }),
    }
  )
  .delete("/:id", async ({ userId, params, set }: any) => {
    const match = await prisma.match.findUnique({ where: { id: params.id } });

    if (!match) {
      set.status = 404;
      return { error: "Match not found" };
    }

    if (match.userAId !== userId && match.userBId !== userId) {
      set.status = 403;
      return { error: "Not authorized to delete this match" };
    }

    await prisma.match.delete({ where: { id: params.id } });

    return { success: true };
  })
  .put("/:id/messages/read", async ({ userId, params, set }: any) => {
    const match = await prisma.match.findUnique({ where: { id: params.id } });

    if (!match) {
      set.status = 404;
      return { error: "Match not found" };
    }

    if (match.userAId !== userId && match.userBId !== userId) {
      set.status = 403;
      return { error: "Not authorized" };
    }

    const result = await prisma.message.updateMany({
      where: {
        matchId: params.id,
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return { success: true, count: result.count };
  });
