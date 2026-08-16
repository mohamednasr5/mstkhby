/**
 * ============================================================
 * Mstkhby — Telegram Realtime Notifications (Firebase Functions)
 * ============================================================
 * WHY THIS FILE EXISTS SEPARATELY FROM THE CLOUDFLARE WORKER:
 * Your real users/messages/reports live in Firebase Realtime
 * Database, written directly from the browser (js/auth.js,
 * js/messages.js) — the Cloudflare Worker (api.js) never sees
 * those writes. The correct, instant way to notify Telegram the
 * moment something happens in the *real* database is a Firebase
 * Database trigger, which is exactly what this file sets up.
 *
 * Together with worker/telegram-bot.js (which handles moderation/
 * media/ban events that genuinely happen inside the Worker), this
 * gives you full real-time coverage of the platform in one Telegram
 * bot — nothing here touches or modifies any existing app code.
 *
 * SETUP:
 *   1) firebase init functions   (if you don't have a functions/ dir yet)
 *   2) Copy this file to functions/index.js
 *   3) cd functions && npm install firebase-functions firebase-admin
 *   4) Set the two secrets (uses the SAME bot as the Worker):
 *        firebase functions:secrets:set TELEGRAM_BOT_TOKEN
 *        firebase functions:secrets:set TELEGRAM_ADMIN_CHAT_ID
 *   5) firebase deploy --only functions
 *   (Requires the Blaze pay-as-you-go plan — outbound network calls
 *   from Cloud Functions need it. The free tier covers this volume
 *   of Telegram API calls comfortably for most projects.)
 */

const { onValueCreated } = require("firebase-functions/v2/database");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const TELEGRAM_ADMIN_CHAT_ID = defineSecret("TELEGRAM_ADMIN_CHAT_ID");

const secrets = [TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID];

function esc(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendTelegram(text, extra = {}) {
  const token = TELEGRAM_BOT_TOKEN.value();
  const chatId = TELEGRAM_ADMIN_CHAT_ID.value();
  if (!token || !chatId) {
    logger.warn("Telegram secrets not configured — skipping notification");
    return;
  }
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...extra
      })
    });
    if (!resp.ok) {
      logger.error("Telegram sendMessage failed", await resp.text());
    }
  } catch (err) {
    logger.error("Telegram sendMessage error", err);
  }
}

/**
 * 👤 New user registered — fires the instant users/{uid}/profile is
 * first written (see js/auth.js register()).
 */
exports.telegramNotifyNewUser = onValueCreated(
  { ref: "/users/{uid}/profile", secrets },
  async (event) => {
    const profile = event.data.val();
    if (!profile) return;
    await sendTelegram(
      `👤 <b>مستخدم جديد سجّل في مستخبي</b>\n` +
      `الاسم: ${esc(profile.displayName)}\n` +
      `المعرف: @${esc(profile.username)}\n` +
      `الرابط: mstkhby.com/${esc(profile.username)}`
    );
  }
);

/**
 * ✉️ New message received by any user — fires instantly on
 * /messages/{messageId} creation (see js/messages.js sendMessage()).
 */
exports.telegramNotifyNewMessage = onValueCreated(
  { ref: "/messages/{messageId}", secrets },
  async (event) => {
    const msg = event.data.val();
    if (!msg) return;

    const identityLabel = { anonymous: "مجهول", alias: "اسم مستعار", reveal: "اسم ظاهر" }[msg.identity] || msg.identity;

    await sendTelegram(
      `✉️ <b>رسالة جديدة</b>\n` +
      `النوع: ${msg.messageType === "text" ? "نص" : msg.messageType === "image" ? "صورة" : "فيديو"}\n` +
      `الهوية: ${esc(identityLabel)}\n` +
      (msg.messageType === "text" && msg.content ? `المحتوى: <i>${esc(msg.content).slice(0, 150)}</i>\n` : "") +
      `المستلم: <code>${esc(msg.recipientId || "")}</code>`
    );
  }
);

/**
 * 🚩 New report filed against a message/user — adjust the ref below
 * to match wherever reports are actually written in your schema
 * (e.g. /reports/{reportId} or /messages/{messageId}/reports/{id}).
 */
exports.telegramNotifyNewReport = onValueCreated(
  { ref: "/reports/{reportId}", secrets },
  async (event) => {
    const report = event.data.val();
    if (!report) return;
    await sendTelegram(
      `🚩 <b>بلاغ جديد</b>\n` +
      `السبب: ${esc(report.reason || "غير محدد")}\n` +
      (report.details ? `تفاصيل: ${esc(report.details)}\n` : ""),
      { reply_markup: { inline_keyboard: [[
        { text: "فتح لوحة التحكم", url: "https://mstkhby.com/admin" }
      ]] } }
    );
  }
);

/**
 * ⚠️ Admin warning sent to a user — mirrors js/auth.js watchWarnings(),
 * so you get a Telegram copy the moment a warning is issued.
 */
exports.telegramNotifyWarningIssued = onValueCreated(
  { ref: "/users/{uid}/warnings/{warningId}", secrets },
  async (event) => {
    const warning = event.data.val();
    const { uid } = event.params;
    if (!warning) return;
    await sendTelegram(
      `⚠️ <b>تم إرسال تحذير لمستخدم</b>\n` +
      `المعرف: <code>${esc(uid)}</code>\n` +
      `السبب: ${esc(warning.reason || "غير محدد")}`
    );
  }
);
