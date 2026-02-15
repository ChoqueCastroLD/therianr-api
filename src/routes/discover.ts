import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { authGuard } from "../lib/auth";
import { sendMatchEmail } from "../lib/email";

const DAILY_SWIPE_LIMIT = 100;

function excludePassword(user: any) {
  const { passwordHash, ...rest } = user;
  return rest;
}

export const discoverRoutes = new Elysia({ prefix: "/discover" })
  .use(authGuard)
  .get("/swipe-count", async ({ userId }: any) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const used = await prisma.swipe.count({
      where: { swiperId: userId, createdAt: { gte: todayStart } },
    });
    return { used, remaining: Math.max(0, DAILY_SWIPE_LIMIT - used), limit: DAILY_SWIPE_LIMIT };
  })
  .get(
    "/",
    async ({ userId, query }: any) => {
      const limit = Math.min(parseInt(query.limit) || 20, 50);
      const theriotype = query.theriotype;
      const minAge = query.minAge ? parseInt(query.minAge) : undefined;
      const maxAge = query.maxAge ? parseInt(query.maxAge) : undefined;
      const maxDistance = query.maxDistance ? parseFloat(query.maxDistance) : undefined;

      const [swipedUserIds, blockedByMe, blockedMe] = await Promise.all([
        prisma.swipe.findMany({
          where: { swiperId: userId },
          select: { targetId: true },
        }),
        prisma.block.findMany({
          where: { blockerId: userId },
          select: { blockedId: true },
        }),
        prisma.block.findMany({
          where: { blockedId: userId },
          select: { blockerId: true },
        }),
      ]);
      const excludeIds = [
        userId,
        ...swipedUserIds.map((s) => s.targetId),
        ...blockedByMe.map((b) => b.blockedId),
        ...blockedMe.map((b) => b.blockerId),
      ];

      const where: any = {
        id: { notIn: excludeIds },
        isBanned: false,
        theriotypes: { some: {} },
      };

      // Only show 18+ users (platform is 18+ only)
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { birthDate: true, latitude: true, longitude: true },
      });

      const now = new Date();
      const eighteenYearsAgo = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
      where.birthDate = { ...(where.birthDate || {}), lte: eighteenYearsAgo };

      if (minAge !== undefined || maxAge !== undefined) {
        const now = new Date();
        if (!where.birthDate) where.birthDate = {};

        if (maxAge !== undefined) {
          const minBirthDate = new Date(now.getFullYear() - maxAge - 1, now.getMonth(), now.getDate());
          if (!where.birthDate.gte || minBirthDate > where.birthDate.gte) {
            where.birthDate.gte = minBirthDate;
          }
        }

        if (minAge !== undefined) {
          const maxBirthDate = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
          if (!where.birthDate.lte || maxBirthDate < where.birthDate.lte) {
            where.birthDate.lte = maxBirthDate;
          }
        }
      }

      if (theriotype) {
        where.theriotypes = {
          some: {
            species: { contains: theriotype, mode: "insensitive" },
          },
        };
      }

      let users = await prisma.user.findMany({
        where,
        include: {
          theriotypes: true,
          photos: { orderBy: { order: "asc" } },
          shifts: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      if (maxDistance !== undefined && currentUser?.latitude && currentUser?.longitude) {
        users = users.filter((user) => {
          if (!user.latitude || !user.longitude) return true;
          return haversineDistance(
            currentUser.latitude!, currentUser.longitude!,
            user.latitude, user.longitude
          ) <= maxDistance;
        });
      }

      return users.map(excludePassword);
    }
  )
  .post(
    "/swipe",
    async ({ userId, body, set }: any) => {
      const { targetId, type } = body;

      if (!["like", "pass", "super_howl"].includes(type)) {
        set.status = 400;
        return { error: "Invalid swipe type" };
      }

      if (targetId === userId) {
        set.status = 400;
        return { error: "Cannot swipe on yourself" };
      }

      // Rate limit: 100 swipes per day
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todaySwipes = await prisma.swipe.count({
        where: { swiperId: userId, createdAt: { gte: todayStart } },
      });
      if (todaySwipes >= DAILY_SWIPE_LIMIT) {
        set.status = 429;
        return { error: "Daily swipe limit reached. Come back tomorrow!" };
      }

      const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
      if (!targetUser) {
        set.status = 404;
        return { error: "Target user not found" };
      }

      await prisma.swipe.upsert({
        where: { swiperId_targetId: { swiperId: userId, targetId } },
        create: { swiperId: userId, targetId, type },
        update: { type },
      });

      if (type === "like" || type === "super_howl") {
        const mutualSwipe = await prisma.swipe.findFirst({
          where: {
            swiperId: targetId,
            targetId: userId,
            type: { in: ["like", "super_howl"] },
          },
        });

        if (mutualSwipe) {
          const [userAId, userBId] = userId < targetId ? [userId, targetId] : [targetId, userId];

          const match = await prisma.match.upsert({
            where: { userAId_userBId: { userAId, userBId } },
            create: { userAId, userBId },
            update: {},
          });

          // Send match email to both users (fire and forget)
          const currentUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, username: true, displayName: true },
          });
          const targetProfile = await prisma.user.findUnique({
            where: { id: targetId },
            select: { email: true, username: true, displayName: true },
          });

          if (currentUser && targetProfile) {
            const currentName = currentUser.displayName || currentUser.username;
            const targetName = targetProfile.displayName || targetProfile.username;
            sendMatchEmail(currentUser.email, currentUser.username, targetName);
            sendMatchEmail(targetProfile.email, targetProfile.username, currentName);
          }

          return { matched: true, matchId: match.id };
        }
      }

      return { matched: false };
    },
    {
      body: t.Object({
        targetId: t.String(),
        type: t.String(),
      }),
    }
  );

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
