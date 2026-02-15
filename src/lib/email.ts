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
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0F0F1A; color: #E8E4D9; padding: 40px 32px; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <span style="font-size: 48px; font-family: Georgia, serif; color: #4ADE80;">&#952;&#916;</span>
        <h1 style="color: #4ADE80; font-size: 28px; margin: 8px 0 0;">Therianr</h1>
      </div>
      <p style="font-size: 16px; line-height: 1.6; color: #E8E4D9;">
        Hey <strong style="color: #FBBF24;">@${safeUsername}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #9CA3AF;">
        Welcome to the pack. Your soul has found its home.
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #9CA3AF;">
        Complete your therian profile to start discovering others who share your spirit. Set your theriotype, describe your shifts, and let the pack find you.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="https://therianr.com" style="display: inline-block; background: #4ADE80; color: #0F0F1A; font-weight: 700; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-size: 15px;">
          Complete Your Profile
        </a>
      </div>
      <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px; margin-top: 32px;">
        <p style="font-size: 12px; color: #6B7280; text-align: center; line-height: 1.5;">
          This is an anti-zoo community. Zero tolerance for any form of animal abuse.<br/>
          If you received this email by mistake, you can safely ignore it.
        </p>
      </div>
    </div>
  `;

  sendEmail(to, "Welcome to Therianr — Find Your Pack", html);
}

export async function sendMatchEmail(to: string, username: string, matchName: string) {
  const safeUsername = escapeHtml(username);
  const safeMatchName = escapeHtml(matchName);
  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0F0F1A; color: #E8E4D9; padding: 40px 32px; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <span style="font-size: 48px; font-family: Georgia, serif; color: #4ADE80;">&#952;&#916;</span>
        <h1 style="color: #FBBF24; font-size: 24px; margin: 8px 0 0;">Pack Match!</h1>
      </div>
      <p style="font-size: 16px; line-height: 1.6; color: #E8E4D9;">
        Hey <strong style="color: #FBBF24;">@${safeUsername}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #9CA3AF;">
        You and <strong style="color: #4ADE80;">${safeMatchName}</strong> liked each other. Your paths have crossed in the wild.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="https://therianr.com/#/matches" style="display: inline-block; background: #4ADE80; color: #0F0F1A; font-weight: 700; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-size: 15px;">
          Send a Message
        </a>
      </div>
      <p style="font-size: 12px; color: #6B7280; text-align: center;">
        Therianr — Find Your Pack
      </p>
    </div>
  `;

  sendEmail(to, `You matched with ${safeMatchName}!`, html);
}

export async function sendResetEmail(to: string, username: string, resetLink: string) {
  const safeUsername = escapeHtml(username);
  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0F0F1A; color: #E8E4D9; padding: 40px 32px; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <span style="font-size: 48px; font-family: Georgia, serif; color: #4ADE80;">&#952;&#916;</span>
        <h1 style="color: #4ADE80; font-size: 28px; margin: 8px 0 0;">Therianr</h1>
      </div>
      <p style="font-size: 16px; line-height: 1.6; color: #E8E4D9;">
        Hey <strong style="color: #FBBF24;">@${safeUsername}</strong>,
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #9CA3AF;">
        Recibimos una solicitud para restablecer la contrasena de tu cuenta. Si no fuiste tu, puedes ignorar este mensaje.
      </p>
      <p style="font-size: 15px; line-height: 1.6; color: #9CA3AF;">
        Este enlace expira en 1 hora.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetLink}" style="display: inline-block; background: #4ADE80; color: #0F0F1A; font-weight: 700; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-size: 15px;">
          Restablecer Contrasena
        </a>
      </div>
      <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px; margin-top: 32px;">
        <p style="font-size: 12px; color: #6B7280; text-align: center; line-height: 1.5;">
          Si no solicitaste este cambio, puedes ignorar este correo.<br/>
          Therianr — Find Your Pack
        </p>
      </div>
    </div>
  `;

  sendEmail(to, "Recupera tu cuenta - Therianr", html);
}
