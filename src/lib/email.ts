import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "Therianr <noreply@therianr.com>";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Rate limiter — Resend allows 2 req/sec, we enforce 600ms between calls
const RATE_LIMIT_INTERVAL_MS = 600;
let lastResendRequestTime = 0;

async function waitForRateLimit() {
  const elapsed = Date.now() - lastResendRequestTime;
  if (elapsed < RATE_LIMIT_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_INTERVAL_MS - elapsed));
  }
  lastResendRequestTime = Date.now();
}

// Retry on 429 with backoff + jitter
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      if (e.statusCode === 429 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 5000 + Math.random() * 3000));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Unreachable");
}

async function sendEmail(to: string, subject: string, html: string) {
  try {
    await waitForRateLimit();
    await withRetry(() => resend.emails.send({ from: FROM, to, subject, html }));
  } catch (err) {
    console.error(`Failed to send email to ${to}:`, err);
  }
}

export async function sendWelcomeEmail(to: string, username: string) {
  const safeUsername = escapeHtml(username);
  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #0F0F1A 0%, #1a1a2e 100%); color: #E8E4D9; padding: 0; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.4);">
      <!-- Header Banner -->
      <div style="background: linear-gradient(135deg, #4ADE80 0%, #22c55e 100%); padding: 32px; text-align: center;">
        <div style="font-size: 56px; margin-bottom: 8px;">🐾</div>
        <h1 style="color: #0F0F1A; font-size: 32px; margin: 0; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">Welcome to the Pack!</h1>
      </div>

      <!-- Main Content -->
      <div style="padding: 40px 32px;">
        <p style="font-size: 18px; line-height: 1.6; color: #E8E4D9; margin-bottom: 8px;">
          Hey <strong style="color: #FBBF24; font-size: 20px;">@${safeUsername}</strong> 🌙
        </p>
        <p style="font-size: 16px; line-height: 1.8; color: #9CA3AF; margin-bottom: 24px;">
          Your soul has found its home. Welcome to <strong style="color: #4ADE80;">Therianr</strong> — a safe space where therians connect, share experiences, and find their pack.
        </p>

        <!-- Feature Cards -->
        <div style="background: rgba(74, 222, 128, 0.1); border-left: 4px solid #4ADE80; padding: 16px; margin: 24px 0; border-radius: 8px;">
          <p style="font-size: 15px; color: #E8E4D9; margin: 0; line-height: 1.6;">
            <strong style="color: #4ADE80;">✨ Next Steps:</strong><br/>
            Complete your profile with your theriotypes, shifts, and interests to start discovering kindred spirits who truly understand.
          </p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="https://therianr.com" style="display: inline-block; background: linear-gradient(135deg, #4ADE80 0%, #22c55e 100%); color: #0F0F1A; font-weight: 700; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-size: 16px; box-shadow: 0 4px 12px rgba(74, 222, 128, 0.3); transition: transform 0.2s;">
            🐺 Complete Your Profile
          </a>
        </div>

        <p style="font-size: 14px; color: #6B7280; text-align: center; margin-top: 32px; line-height: 1.6;">
          Questions? Reply to this email — we're here to help!
        </p>
      </div>

      <!-- Footer -->
      <div style="background: rgba(0,0,0,0.3); padding: 24px 32px; border-top: 1px solid rgba(255,255,255,0.1);">
        <p style="font-size: 11px; color: #6B7280; text-align: center; line-height: 1.6; margin: 0;">
          <strong style="color: #ef4444;">⚠️ Anti-Zoo Community</strong><br/>
          Zero tolerance for any form of animal abuse. This is a safe, respectful space for therians only.<br/><br/>
          <span style="color: #9CA3AF;">Therianr • Find Your Pack 🐾</span><br/>
          <a href="https://therianr.com/#/rules" style="color: #4ADE80; text-decoration: none;">Community Guidelines</a> •
          <a href="https://therianr.com/#/privacy" style="color: #4ADE80; text-decoration: none;">Privacy Policy</a>
        </p>
      </div>
    </div>
  `;

  sendEmail(to, "🐾 Welcome to Therianr — Find Your Pack", html);
}

export async function sendMatchEmail(to: string, username: string, matchName: string) {
  const safeUsername = escapeHtml(username);
  const safeMatchName = escapeHtml(matchName);
  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #0F0F1A 0%, #1a1a2e 100%); color: #E8E4D9; padding: 0; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.4);">
      <!-- Animated Header Banner -->
      <div style="background: linear-gradient(135deg, #FBBF24 0%, #fb923c 100%); padding: 40px 32px; text-align: center; position: relative;">
        <div style="font-size: 64px; margin-bottom: 12px; animation: pulse 2s infinite;">✨</div>
        <h1 style="color: #0F0F1A; font-size: 36px; margin: 0 0 8px 0; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">It's a Match!</h1>
        <p style="color: rgba(15, 15, 26, 0.8); font-size: 16px; margin: 0; font-weight: 600;">Your paths have crossed 🐾</p>
      </div>

      <!-- Main Content -->
      <div style="padding: 40px 32px;">
        <p style="font-size: 18px; line-height: 1.6; color: #E8E4D9; text-align: center; margin-bottom: 24px;">
          Hey <strong style="color: #FBBF24;">@${safeUsername}</strong>! 🎉
        </p>

        <!-- Match Card -->
        <div style="background: linear-gradient(135deg, rgba(74, 222, 128, 0.15) 0%, rgba(34, 197, 94, 0.05) 100%); border: 2px solid #4ADE80; padding: 24px; margin: 24px 0; border-radius: 12px; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">🐺💚</div>
          <p style="font-size: 20px; color: #E8E4D9; margin: 0 0 8px 0; font-weight: 700;">
            You and <span style="color: #4ADE80;">${safeMatchName}</span>
          </p>
          <p style="font-size: 16px; color: #9CA3AF; margin: 0; line-height: 1.6;">
            both liked each other! The connection is mutual — time to break the ice and start the conversation.
          </p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="https://therianr.com/#/matches" style="display: inline-block; background: linear-gradient(135deg, #4ADE80 0%, #22c55e 100%); color: #0F0F1A; font-weight: 700; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-size: 16px; box-shadow: 0 4px 12px rgba(74, 222, 128, 0.3);">
            💬 Send a Message
          </a>
        </div>

        <p style="font-size: 14px; color: #6B7280; text-align: center; margin-top: 32px; line-height: 1.6;">
          Don't be shy! Say hi and let the pack connection begin 🌙
        </p>
      </div>

      <!-- Footer -->
      <div style="background: rgba(0,0,0,0.3); padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.1);">
        <p style="font-size: 11px; color: #9CA3AF; text-align: center; margin: 0;">
          Therianr • Find Your Pack 🐾<br/>
          <a href="https://therianr.com/#/matches" style="color: #4ADE80; text-decoration: none;">View All Matches</a>
        </p>
      </div>
    </div>
  `;

  sendEmail(to, `✨ You matched with ${safeMatchName}!`, html);
}

export async function sendResetEmail(to: string, username: string, resetLink: string) {
  const safeUsername = escapeHtml(username);
  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #0F0F1A 0%, #1a1a2e 100%); color: #E8E4D9; padding: 0; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.4);">
      <!-- Header Banner -->
      <div style="background: linear-gradient(135deg, #fb923c 0%, #f97316 100%); padding: 32px; text-align: center;">
        <div style="font-size: 56px; margin-bottom: 8px;">🔐</div>
        <h1 style="color: #0F0F1A; font-size: 32px; margin: 0; font-weight: 800;">Password Reset</h1>
      </div>

      <!-- Main Content -->
      <div style="padding: 40px 32px;">
        <p style="font-size: 18px; line-height: 1.6; color: #E8E4D9; margin-bottom: 8px;">
          Hey <strong style="color: #FBBF24;">@${safeUsername}</strong>,
        </p>
        <p style="font-size: 16px; line-height: 1.8; color: #9CA3AF; margin-bottom: 24px;">
          We received a request to reset your password. Click the button below to create a new one.
        </p>

        <!-- Warning Box -->
        <div style="background: rgba(251, 146, 60, 0.1); border-left: 4px solid #fb923c; padding: 16px; margin: 24px 0; border-radius: 8px;">
          <p style="font-size: 14px; color: #fb923c; margin: 0 0 8px 0; font-weight: 700;">⚠️ Security Notice</p>
          <p style="font-size: 13px; color: #E8E4D9; margin: 0; line-height: 1.6;">
            This link expires in <strong>1 hour</strong>. If you didn't request this, someone may be trying to access your account. Please secure your email and consider changing your password.
          </p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #4ADE80 0%, #22c55e 100%); color: #0F0F1A; font-weight: 700; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-size: 16px; box-shadow: 0 4px 12px rgba(74, 222, 128, 0.3);">
            🔓 Reset Password
          </a>
        </div>

        <p style="font-size: 13px; color: #6B7280; text-align: center; margin-top: 32px; line-height: 1.6;">
          If you didn't request this reset, you can safely ignore this email.<br/>
          Your password will remain unchanged.
        </p>
      </div>

      <!-- Footer -->
      <div style="background: rgba(0,0,0,0.3); padding: 24px 32px; border-top: 1px solid rgba(255,255,255,0.1);">
        <p style="font-size: 11px; color: #9CA3AF; text-align: center; margin: 0; line-height: 1.6;">
          Therianr • Find Your Pack 🐾<br/>
          Need help? Reply to this email or visit our <a href="https://therianr.com/#/rules" style="color: #4ADE80; text-decoration: none;">Support Center</a>
        </p>
      </div>
    </div>
  `;

  sendEmail(to, "🔐 Reset Your Therianr Password", html);
}

export async function sendNewMessageEmail(to: string, username: string, senderName: string, preview: string) {
  const safeUsername = escapeHtml(username);
  const safeSenderName = escapeHtml(senderName);
  const safePreview = escapeHtml(preview.substring(0, 100));
  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #0F0F1A 0%, #1a1a2e 100%); color: #E8E4D9; padding: 0; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.4);">
      <!-- Header Banner -->
      <div style="background: linear-gradient(135deg, #4ADE80 0%, #22c55e 100%); padding: 32px; text-align: center;">
        <div style="font-size: 56px; margin-bottom: 8px;">💬</div>
        <h1 style="color: #0F0F1A; font-size: 32px; margin: 0; font-weight: 800;">New Message!</h1>
      </div>

      <!-- Main Content -->
      <div style="padding: 40px 32px;">
        <p style="font-size: 18px; line-height: 1.6; color: #E8E4D9; margin-bottom: 24px; text-align: center;">
          Hey <strong style="color: #FBBF24;">@${safeUsername}</strong>! 📨
        </p>

        <!-- Message Card -->
        <div style="background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.3); padding: 20px; margin: 24px 0; border-radius: 12px;">
          <p style="font-size: 16px; color: #4ADE80; margin: 0 0 12px 0; font-weight: 700;">
            From: ${safeSenderName}
          </p>
          <p style="font-size: 15px; color: #E8E4D9; margin: 0; line-height: 1.6; font-style: italic;">
            "${safePreview}${preview.length > 100 ? '...' : ''}"
          </p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="https://therianr.com/#/matches" style="display: inline-block; background: linear-gradient(135deg, #4ADE80 0%, #22c55e 100%); color: #0F0F1A; font-weight: 700; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-size: 16px; box-shadow: 0 4px 12px rgba(74, 222, 128, 0.3);">
            💬 Read & Reply
          </a>
        </div>

        <p style="font-size: 13px; color: #6B7280; text-align: center; margin-top: 32px;">
          Don't keep them waiting! 🐾
        </p>
      </div>

      <!-- Footer -->
      <div style="background: rgba(0,0,0,0.3); padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.1);">
        <p style="font-size: 11px; color: #9CA3AF; text-align: center; margin: 0;">
          Therianr • Find Your Pack 🐾<br/>
          <a href="https://therianr.com/#/settings" style="color: #4ADE80; text-decoration: none;">Manage Email Notifications</a>
        </p>
      </div>
    </div>
  `;

  sendEmail(to, `💬 New message from ${safeSenderName}`, html);
}

export async function sendSuperHowlEmail(to: string, username: string, senderName: string) {
  const safeUsername = escapeHtml(username);
  const safeSenderName = escapeHtml(senderName);
  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #0F0F1A 0%, #1a1a2e 100%); color: #E8E4D9; padding: 0; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.4);">
      <!-- Header Banner -->
      <div style="background: linear-gradient(135deg, #FBBF24 0%, #fb923c 100%); padding: 40px 32px; text-align: center;">
        <div style="font-size: 72px; margin-bottom: 12px;">🌟</div>
        <h1 style="color: #0F0F1A; font-size: 36px; margin: 0 0 8px 0; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">Super Howl!</h1>
        <p style="color: rgba(15, 15, 26, 0.8); font-size: 16px; margin: 0; font-weight: 600;">Someone is really interested in you!</p>
      </div>

      <!-- Main Content -->
      <div style="padding: 40px 32px;">
        <p style="font-size: 18px; line-height: 1.6; color: #E8E4D9; text-align: center; margin-bottom: 24px;">
          Hey <strong style="color: #FBBF24;">@${safeUsername}</strong>! 🎉
        </p>

        <!-- Super Howl Card -->
        <div style="background: linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(251, 146, 60, 0.1) 100%); border: 2px solid #FBBF24; padding: 28px; margin: 24px 0; border-radius: 12px; text-align: center;">
          <div style="font-size: 64px; margin-bottom: 16px;">🐺⭐</div>
          <p style="font-size: 22px; color: #FBBF24; margin: 0 0 12px 0; font-weight: 700;">
            ${safeSenderName}
          </p>
          <p style="font-size: 16px; color: #E8E4D9; margin: 0; line-height: 1.6;">
            sent you a <strong style="color: #FBBF24;">Super Howl</strong>!<br/>
            They're letting you know you caught their eye 👀
          </p>
        </div>

        <div style="background: rgba(74, 222, 128, 0.1); border-left: 4px solid #4ADE80; padding: 16px; margin: 24px 0; border-radius: 8px;">
          <p style="font-size: 14px; color: #E8E4D9; margin: 0; line-height: 1.6;">
            <strong style="color: #4ADE80;">💡 What's a Super Howl?</strong><br/>
            It's like a regular like, but way more enthusiastic! They're showing extra interest in connecting with you.
          </p>
        </div>

        <div style="text-align: center; margin: 32px 0;">
          <a href="https://therianr.com/#/discover" style="display: inline-block; background: linear-gradient(135deg, #FBBF24 0%, #fb923c 100%); color: #0F0F1A; font-weight: 700; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-size: 16px; box-shadow: 0 4px 12px rgba(251, 191, 36, 0.4);">
            👀 Check Them Out
          </a>
        </div>

        <p style="font-size: 14px; color: #6B7280; text-align: center; margin-top: 32px; line-height: 1.6;">
          Visit their profile and see if the feeling is mutual! 🌙
        </p>
      </div>

      <!-- Footer -->
      <div style="background: rgba(0,0,0,0.3); padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.1);">
        <p style="font-size: 11px; color: #9CA3AF; text-align: center; margin: 0;">
          Therianr • Find Your Pack 🐾<br/>
          <a href="https://therianr.com/#/settings" style="color: #4ADE80; text-decoration: none;">Manage Email Notifications</a>
        </p>
      </div>
    </div>
  `;

  sendEmail(to, `🌟 ${safeSenderName} sent you a Super Howl!`, html);
}
