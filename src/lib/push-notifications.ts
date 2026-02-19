import { prisma } from "./prisma";

// OneSignal Configuration
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;
const ONESIGNAL_API_URL = "https://onesignal.com/api/v1/notifications";

const isConfigured = !!(ONESIGNAL_APP_ID && ONESIGNAL_API_KEY);

if (!isConfigured) {
  console.warn("⚠️ OneSignal not configured. Push notifications will be disabled.");
  console.warn("Set ONESIGNAL_APP_ID and ONESIGNAL_API_KEY environment variables.");
} else {
  console.log("✅ OneSignal configured successfully");
}

function checkConfiguration() {
  return isConfigured;
}

export async function registerPushToken(userId: string, token: string, platform: string) {
  try {
    await prisma.pushToken.upsert({
      where: { userId_token: { userId, token } },
      create: { userId, token, platform },
      update: { platform, updatedAt: new Date() },
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to register push token:", error);
    throw error;
  }
}

export async function removePushToken(userId: string, token: string) {
  try {
    await prisma.pushToken.deleteMany({
      where: { userId, token },
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to remove push token:", error);
    throw error;
  }
}

async function sendOneSignalNotification(
  playerIds: string[],
  heading: string,
  content: string,
  data?: Record<string, string>
) {
  if (!checkConfiguration()) {
    return;
  }

  if (playerIds.length === 0) {
    console.log("No player IDs to send notification to");
    return;
  }

  try {
    const response = await fetch(ONESIGNAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_player_ids: playerIds,
        headings: { en: heading },
        contents: { en: content },
        data: data || {},
        android_channel_id: "therianr_default",
        small_icon: "ic_notification",
        large_icon: "ic_notification_large",
        android_accent_color: "FF4ADE80",
        priority: 10,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("OneSignal API error:", result);

      // Clean up invalid player IDs
      if (result.errors?.invalid_player_ids) {
        const invalidIds = result.errors.invalid_player_ids;
        console.log(`Removing ${invalidIds.length} invalid player IDs`);

        await prisma.pushToken.deleteMany({
          where: {
            token: { in: invalidIds },
          },
        });
      }
    } else {
      console.log(`✅ Notification sent to ${playerIds.length} device(s)`);
    }
  } catch (error) {
    console.error("Failed to send OneSignal notification:", error);
  }
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
) {
  if (!checkConfiguration()) {
    return;
  }

  try {
    // Get all push tokens for the user
    const tokens = await prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
    });

    if (tokens.length === 0) {
      console.log(`No push tokens found for user ${userId}`);
      return;
    }

    const playerIds = tokens.map((t) => t.token);
    await sendOneSignalNotification(playerIds, title, body, data);
  } catch (error) {
    console.error("Failed to send push notification:", error);
  }
}

export async function sendMatchNotification(userId: string, matchName: string) {
  await sendPushNotification(
    userId,
    "✨ It's a Match!",
    `You and ${matchName} liked each other!`,
    { type: "match", screen: "matches" }
  );
}

export async function sendMessageNotification(
  userId: string,
  senderName: string,
  preview: string
) {
  await sendPushNotification(
    userId,
    `💬 ${senderName}`,
    preview.substring(0, 100),
    { type: "message", screen: "matches" }
  );
}

export async function sendSuperHowlNotification(userId: string, senderName: string) {
  await sendPushNotification(
    userId,
    "🌟 Super Howl!",
    `${senderName} sent you a Super Howl!`,
    { type: "super_howl", screen: "discover" }
  );
}
