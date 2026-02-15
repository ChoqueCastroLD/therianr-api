import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { authGuard } from "../lib/auth";
import { getPresignedUploadUrl, deleteFromR2, getKeyFromUrl } from "../lib/r2";

const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_PHOTOS = 6;

function excludePassword(user: any) {
  const { passwordHash, ...rest } = user;
  return rest;
}

const USER_INCLUDES = {
  theriotypes: true,
  photos: { orderBy: { order: "asc" as const } },
  shifts: true,
};

export const profileRoutes = new Elysia({ prefix: "/profile" })
  .use(authGuard)
  .get("/me", async ({ userId, set }: any) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: USER_INCLUDES,
    });

    if (!user) {
      set.status = 404;
      return { error: "User not found" };
    }

    return excludePassword(user);
  })
  .put(
    "/me",
    async ({ userId, body }: any) => {
      const {
        theriotypes,
        shifts,
        displayName,
        bio,
        pronouns,
        location,
        latitude,
        longitude,
        lookingFor,
        isOtherkin,
        isFurry,
        awakeningYear,
        therianType,
        integrationLevel,
        prefAgeMin,
        prefAgeMax,
        prefMaxDistance,
        prefTheriotypes,
        activities,
      } = body;

      const updateData: any = {};
      if (displayName !== undefined) updateData.displayName = displayName;
      if (bio !== undefined) updateData.bio = bio;
      if (pronouns !== undefined) updateData.pronouns = pronouns;
      if (location !== undefined) updateData.location = location;
      if (latitude !== undefined) updateData.latitude = latitude;
      if (longitude !== undefined) updateData.longitude = longitude;
      if (lookingFor !== undefined) updateData.lookingFor = lookingFor;
      if (isOtherkin !== undefined) updateData.isOtherkin = isOtherkin;
      if (isFurry !== undefined) updateData.isFurry = isFurry;
      if (awakeningYear !== undefined) updateData.awakeningYear = awakeningYear;
      if (therianType !== undefined) updateData.therianType = therianType;
      if (integrationLevel !== undefined) updateData.integrationLevel = integrationLevel;
      if (prefAgeMin !== undefined) updateData.prefAgeMin = prefAgeMin;
      if (prefAgeMax !== undefined) updateData.prefAgeMax = prefAgeMax;
      if (prefMaxDistance !== undefined) updateData.prefMaxDistance = prefMaxDistance;
      if (prefTheriotypes !== undefined) updateData.prefTheriotypes = prefTheriotypes;
      if (activities !== undefined) updateData.activities = activities;

      const user = await prisma.$transaction(async (tx) => {
        if (theriotypes !== undefined) {
          await tx.theriotype.deleteMany({ where: { userId } });
          if (theriotypes.length > 0) {
            await tx.theriotype.createMany({
              data: theriotypes.map((th: any) => ({
                userId,
                species: th.species,
                category: th.category || "Standard",
                isPrimary: th.isPrimary ?? false,
                note: th.note ?? null,
              })),
            });
          }
        }

        if (shifts !== undefined) {
          await tx.userShift.deleteMany({ where: { userId } });
          if (shifts.length > 0) {
            await tx.userShift.createMany({
              data: shifts.map((type: string) => ({ userId, type })),
            });
          }
        }

        return tx.user.update({
          where: { id: userId },
          data: updateData,
          include: USER_INCLUDES,
        });
      });

      return excludePassword(user);
    },
    {
      body: t.Object({
        displayName: t.Optional(t.String({ maxLength: 50 })),
        bio: t.Optional(t.String({ maxLength: 1000 })),
        pronouns: t.Optional(t.String({ maxLength: 30 })),
        location: t.Optional(t.String({ maxLength: 100 })),
        latitude: t.Optional(t.Number()),
        longitude: t.Optional(t.Number()),
        lookingFor: t.Optional(t.Array(t.String({ maxLength: 50 }), { maxItems: 10 })),
        isOtherkin: t.Optional(t.Boolean()),
        isFurry: t.Optional(t.Boolean()),
        awakeningYear: t.Optional(t.Number()),
        therianType: t.Optional(t.String({ maxLength: 50 })),
        integrationLevel: t.Optional(t.Number()),
        prefAgeMin: t.Optional(t.Number()),
        prefAgeMax: t.Optional(t.Number()),
        prefMaxDistance: t.Optional(t.Number()),
        prefTheriotypes: t.Optional(t.Array(t.String({ maxLength: 100 }), { maxItems: 30 })),
        activities: t.Optional(t.Array(t.String({ maxLength: 50 }), { maxItems: 20 })),
        theriotypes: t.Optional(
          t.Array(
            t.Object({
              species: t.String({ maxLength: 100 }),
              category: t.Optional(t.String({ maxLength: 50 })),
              isPrimary: t.Optional(t.Boolean()),
              note: t.Optional(t.String({ maxLength: 500 })),
            }),
            { maxItems: 30 }
          )
        ),
        shifts: t.Optional(t.Array(t.String({ maxLength: 50 }), { maxItems: 20 })),
      }),
    }
  )
  // Step 1: Get presigned URL for direct browser → R2 upload
  .post(
    "/photos/presigned-url",
    async ({ userId, body, set }: any) => {
      const { filename, contentType } = body;

      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        set.status = 400;
        return { error: "Invalid file type. Allowed: JPG, PNG, GIF, WebP" };
      }

      const photoCount = await prisma.photo.count({ where: { userId } });
      if (photoCount >= MAX_PHOTOS) {
        set.status = 400;
        return { error: `Maximum ${MAX_PHOTOS} photos allowed` };
      }

      const ext = filename.split(".").pop() || contentType.split("/")[1] || "jpg";
      const fileKey = `photos/${userId}/${Date.now()}_${crypto.randomUUID()}.${ext}`;

      const { uploadUrl, publicUrl } = await getPresignedUploadUrl(fileKey, contentType);

      return { uploadUrl, fileKey, publicUrl };
    },
    {
      body: t.Object({
        filename: t.String(),
        contentType: t.String(),
      }),
    }
  )
  // Step 2: After browser uploads to R2, confirm and save to DB
  .post(
    "/photos/confirm",
    async ({ userId, body, set }: any) => {
      const { fileKey, isGear } = body;

      // Validate that fileKey belongs to this user's directory
      if (!fileKey.startsWith(`photos/${userId}/`)) {
        set.status = 403;
        return { error: "Invalid file key" };
      }

      const photoCount = await prisma.photo.count({ where: { userId } });
      if (photoCount >= MAX_PHOTOS) {
        set.status = 400;
        return { error: `Maximum ${MAX_PHOTOS} photos allowed` };
      }

      const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;

      const photo = await prisma.photo.create({
        data: {
          userId,
          url: publicUrl,
          order: photoCount,
          isGear: isGear ?? false,
        },
      });

      return photo;
    },
    {
      body: t.Object({
        fileKey: t.String(),
        isGear: t.Optional(t.Boolean()),
      }),
    }
  )
  .delete("/me", async ({ userId }: any) => {
    const photos = await prisma.photo.findMany({ where: { userId } });
    for (const photo of photos) {
      const key = getKeyFromUrl(photo.url);
      if (key) {
        try {
          await deleteFromR2(key);
        } catch {
          // File may already be deleted from R2
        }
      }
    }

    await prisma.user.delete({ where: { id: userId } });

    return { success: true };
  })
  .delete("/photos/:id", async ({ userId, params, set }: any) => {
    const photo = await prisma.photo.findUnique({
      where: { id: params.id },
    });

    if (!photo) {
      set.status = 404;
      return { error: "Photo not found" };
    }

    if (photo.userId !== userId) {
      set.status = 403;
      return { error: "Not authorized to delete this photo" };
    }

    const key = getKeyFromUrl(photo.url);
    if (key) {
      try {
        await deleteFromR2(key);
      } catch {
        // File may already be deleted from R2
      }
    }

    await prisma.photo.delete({ where: { id: params.id } });

    return { success: true };
  });
