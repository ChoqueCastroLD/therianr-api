import { Elysia, t } from "elysia";
import { authGuard } from "../lib/auth";
import { registerPushToken, removePushToken } from "../lib/push-notifications";

export const notificationRoutes = new Elysia({ prefix: "/notifications" })
  .use(authGuard)
  .post(
    "/register-token",
    async ({ userId, body, set }: any) => {
      const { token, platform } = body;

      if (!token || !platform) {
        set.status = 400;
        return { error: "Token and platform are required" };
      }

      if (!["android", "ios", "web"].includes(platform)) {
        set.status = 400;
        return { error: "Invalid platform. Must be android, ios, or web" };
      }

      try {
        await registerPushToken(userId, token, platform);
        return { success: true };
      } catch (error) {
        set.status = 500;
        return { error: "Failed to register push token" };
      }
    },
    {
      body: t.Object({
        token: t.String(),
        platform: t.String(),
      }),
    }
  )
  .post(
    "/remove-token",
    async ({ userId, body, set }: any) => {
      const { token } = body;

      if (!token) {
        set.status = 400;
        return { error: "Token is required" };
      }

      try {
        await removePushToken(userId, token);
        return { success: true };
      } catch (error) {
        set.status = 500;
        return { error: "Failed to remove push token" };
      }
    },
    {
      body: t.Object({
        token: t.String(),
      }),
    }
  );
