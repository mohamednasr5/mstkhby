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

const { onValueCreated, onValueUpdated } = require("firebase-functions/v2/database");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const TELEGRAM_ADMIN_CHAT_ID = defineSecret("TELEGRAM_ADMIN_CHAT_ID");

const secrets = [TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_CHAT_ID];

/**
 * Mirrors every real-time event this file notifies about into
 * /botActivity, so the admin dashboard's "بوت تيليجرام" tab shows one
 * unified feed of everything the bot has reported — regardless of
 * whether the event came from here (direct Firebase writes) or from
 * the Cloudflare Worker (moderation/bans/report actions).
 */
async function logActivity(type, text) {
  try {
    await admin.database().ref("botActivity").push({
      type,
      text,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    logger.error("logActivity failed", err);
  }
}

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
    await logActivity("new_user", `مستخدم جديد: ${profile.displayName || profile.username || event.params.uid}`);
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
    await logActivity("new_message", `رسالة ${msg.messageType || "text"} جديدة إلى ${msg.recipientId || ""}`);
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
    await logActivity("new_report", `بلاغ جديد — ${report.reason || "غير محدد"}`);
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
    await logActivity("warning_issued", `تحذير لمستخدم ${uid} — ${warning.reason || "غير محدد"}`);
  }
);

/**
 * ⛔ Ban status changed on a user — fires whether the admin toggled it
 * from the dashboard (admin/js/admin.js writes directly to this path)
 * or the Worker did it via a Telegram /ban command. Only notifies on
 * an actual transition, not on unrelated writes to the same node.
 */
exports.telegramNotifyBanStatusChanged = onValueUpdated(
  { ref: "/users/{uid}/entitlements/status", secrets },
  async (event) => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    if (before === after) return;
    const { uid } = event.params;

    if (after === "banned") {
      await sendTelegram(`⛔ <b>تم حظر مستخدم</b>\nالمعرف: <code>${esc(uid)}</code>`);
      await logActivity("user_banned", `تم حظر المستخدم ${uid}`);
    } else if (before === "banned") {
      await sendTelegram(`✅ <b>تم إلغاء حظر مستخدم</b>\nالمعرف: <code>${esc(uid)}</code>`);
      await logActivity("user_unbanned", `تم إلغاء حظر المستخدم ${uid}`);
    }
  }
);
