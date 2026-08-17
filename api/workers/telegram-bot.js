// telegram-bot.js
import FirebaseAdmin from './firebase-admin.js';
// ============================================================
// Mstkhby — Telegram Admin Bot (Cloudflare Worker module)
// ============================================================
// Two jobs:
//   1) PUSH — instantly notify the admin's Telegram chat about
//      important events this Worker actually handles (blocked
//      content, media rejections, bans, report actions). Every call
//      is fire-and-forget via ctx.waitUntil() in api.js, so a
//      Telegram outage can NEVER slow down or break a real API
//      response.
//   2) PULL — a webhook endpoint (POST /api/telegram/webhook) so the
//      admin can talk back to the bot: /stats, /reports, /ban, etc.
//      Inline buttons on report notifications let the admin act
//      with one tap.
//
// Setup — see the README.md next to this file.

const TelegramBot = {
  apiUrl(env) {
    return `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;
  },

  // ---------------------------------------------------------
  // Low-level senders
  // ---------------------------------------------------------
  async call(env, method, payload) {
    if (!env?.TELEGRAM_BOT_TOKEN) {
      console.warn(`Telegram not configured — skipped ${method}`);
      return null;
    }
    try {
      const resp = await fetch(`${this.apiUrl(env)}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        console.error(`Telegram ${method} failed:`, resp.status, await resp.text());
        return null;
      }
      return await resp.json();
    } catch (err) {
      console.error(`Telegram ${method} error:`, err);
      return null;
    }
  },

  async sendMessage(env, chatId, text, extra = {}) {
    return this.call(env, 'sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...extra
    });
  },

  async editMessageText(env, chatId, messageId, text, extra = {}) {
    return this.call(env, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      ...extra
    });
  },

  async answerCallbackQuery(env, callbackQueryId, text = '', showAlert = false) {
    return this.call(env, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert
    });
  },

  /**
   * Registers this Worker's webhook URL with Telegram. Call this once
   * from a browser/curl against a one-off admin endpoint, or run the
   * curl command in README.md — it does NOT need to run on every
   * request.
   */
  async setWebhook(env, url) {
    return this.call(env, 'setWebhook', {
      url,
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query']
    });
  },

  // ---------------------------------------------------------
  // Notifications (always invoked as: ctx.waitUntil(TelegramBot.notifyX(...)))
  // ---------------------------------------------------------
  isConfigured(env) {
    return !!(env?.TELEGRAM_BOT_TOKEN && env?.TELEGRAM_ADMIN_CHAT_ID);
  },

  esc(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },

  async notifyBlockedContent(env, { kind, reason, categories, preview, senderFingerprint }) {
    if (!this.isConfigured(env)) return;
    const kindLabel = kind === 'image' ? '🖼️ صورة' : '✍️ نص';
    await this.sendMessage(env, env.TELEGRAM_ADMIN_CHAT_ID,
      `🚫 <b>تم حظر محتوى تلقائياً (فحص NVIDIA)</b>\n` +
      `النوع: ${kindLabel}\n` +
      `السبب: ${this.esc(reason || 'غير محدد')}\n` +
      (categories ? `الفئات: ${this.esc(categories)}\n` : '') +
      (preview ? `المحتوى: <i>${this.esc(preview.slice(0, 200))}</i>\n` : '') +
      (senderFingerprint ? `بصمة المرسل: <code>${this.esc(senderFingerprint)}</code>` : '')
    );
  },

  async notifyModerationDegraded(env, reason) {
    if (!this.isConfigured(env)) return;
    await this.sendMessage(env, env.TELEGRAM_ADMIN_CHAT_ID,
      `⚠️ <b>تنبيه هام:</b> خدمة فحص المحتوى معطّلة (${this.esc(reason)}) — ` +
      `يتم حظر كل المحتوى تلقائياً كإجراء أمان حتى يتم الإصلاح.`
    );
  },

  async notifyMediaRejected(env, { reason, key }) {
    if (!this.isConfigured(env)) return;
    await this.sendMessage(env, env.TELEGRAM_ADMIN_CHAT_ID,
      `🚫 <b>تم رفض ملف وسائط</b>\n` +
      `السبب: ${this.esc(reason || 'غير محدد')}\n` +
      `المفتاح: <code>${this.esc(key)}</code>`
    );
  },

  async notifyReport(env, report) {
    if (!this.isConfigured(env)) return;
    const id = report.id || report.reportId || '';
    await this.sendMessage(env, env.TELEGRAM_ADMIN_CHAT_ID,
      `🚩 <b>بلاغ جديد</b>\n` +
      `رقم البلاغ: <code>${this.esc(id)}</code>\n` +
      `السبب: ${this.esc(report.reason || 'غير محدد')}\n` +
      (report.details ? `تفاصيل: ${this.esc(report.details)}\n` : ''),
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ اتخاذ إجراء', callback_data: `report:approve:${id}` },
            { text: '❌ تجاهل', callback_data: `report:dismiss:${id}` }
          ]]
        }
      }
    );
  },

  async notifyUserBanned(env, { userId, reason, duration }) {
    if (!this.isConfigured(env)) return;
    await this.sendMessage(env, env.TELEGRAM_ADMIN_CHAT_ID,
      `⛔ <b>تم حظر مستخدم</b>\n` +
      `المعرف: <code>${this.esc(userId)}</code>\n` +
      `المدة: ${this.esc(duration || 'دائم')}\n` +
      `السبب: ${this.esc(reason || 'غير محدد')}`
    );
  },

  // ---------------------------------------------------------
  // Webhook: incoming updates from Telegram
  // ---------------------------------------------------------
  isFromAdmin(env, chatId) {
    return String(chatId) === String(env.TELEGRAM_ADMIN_CHAT_ID);
  },

  async handleWebhook(request, env, api) {
    // Verify the request genuinely came from Telegram (the secret
    // header Telegram echoes back was set via setWebhook() above) —
    // stops randoms from POSTing fake admin commands to this URL.
    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response('Forbidden', { status: 403 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      // Malformed body — ack with 200 anyway so Telegram doesn't retry forever
      return new Response('OK');
    }

    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query, env, api);
    } else if (update.message) {
      await this.handleMessage(update.message, env, api);
    }

    // Always answer fast with 200 — Telegram retries on non-2xx responses
    return new Response('OK');
  },

  async handleMessage(message, env, api) {
    const chatId = message.chat.id;
    const text = (message.text || '').trim();

    if (!this.isFromAdmin(env, chatId)) {
      await this.sendMessage(env, chatId,
        `🚫 هذا البوت خاص بإدارة منصة مستخبي فقط.\n` +
        `معرف المحادثة الخاص بك: <code>${chatId}</code>`
      );
      return;
    }

    const [command, ...args] = text.split(/\s+/);

    switch (command) {
      case '/start':
        await this.sendMessage(env, chatId,
          `👋 أهلاً بك في بوت إدارة <b>مستخبي</b>.\n\n` +
          `<b>الأوامر المتاحة:</b>\n` +
          `/stats — إحصائيات المنصة (مباشرة من قاعدة البيانات)\n` +
          `/reports — عرض البلاغات المعلقة\n` +
          `/verifications — طلبات التوثيق المعلقة\n` +
          `/ban [user_id] [السبب] — حظر مستخدم فوراً\n` +
          `/unban [user_id] — إلغاء حظر مستخدم\n` +
          `/whoami — عرض معرف هذه المحادثة\n` +
          `/help — عرض هذه القائمة`
        );
        break;

      case '/help':
        await this.sendMessage(env, chatId,
          `<b>أوامر البوت:</b>\n` +
          `/stats — إحصائيات عامة\n` +
          `/reports — عرض البلاغات المعلقة\n` +
          `/verifications — طلبات التوثيق المعلقة\n` +
          `/ban [user_id] [السبب] — حظر مستخدم فوراً\n` +
          `/unban [user_id] — إلغاء حظر مستخدم\n` +
          `/whoami — عرض معرف هذه المحادثة`
        );
        break;

      case '/whoami':
        await this.sendMessage(env, chatId, `معرف هذه المحادثة: <code>${chatId}</code>`);
        break;

      case '/stats': {
        try {
          const statsResp = await api.adminGetStats();
          const { stats } = await statsResp.json();
          await this.sendMessage(env, chatId,
            `📊 <b>إحصائيات المنصة</b> <i>(مباشرة الآن)</i>\n\n` +
            `👥 إجمالي المستخدمين: ${stats.totalUsers.toLocaleString('ar')}\n` +
            `✉️ إجمالي الرسائل: ${stats.totalMessages.toLocaleString('ar')}\n` +
            `🚩 إجمالي البلاغات: ${stats.totalReports.toLocaleString('ar')} (معلقة: ${stats.reportsPending})\n` +
            `✔️ طلبات توثيق معلقة: ${stats.verificationsPending}`
          );
        } catch (err) {
          await this.sendMessage(env, chatId, `❌ تعذر جلب الإحصائيات: ${this.esc(err.message)}`);
        }
        break;
      }

      case '/reports': {
        try {
          const reportsResp = await api.adminGetReports({ url: 'https://worker.internal/?status=pending&limit=10' });
          const { reports } = await reportsResp.json();
          if (!reports.length) {
            await this.sendMessage(env, chatId, '✅ لا توجد بلاغات معلقة حالياً.');
            break;
          }
          for (const r of reports) {
            await this.notifyReport(env, r);
          }
        } catch (err) {
          await this.sendMessage(env, chatId, `❌ تعذر جلب البلاغات: ${this.esc(err.message)}`);
        }
        break;
      }

      case '/verifications': {
        try {
          const pending = await FirebaseAdmin.listWhere(env, '/verifications', 'status', 'pending', 10);
          if (!pending.length) {
            await this.sendMessage(env, chatId, '✅ لا توجد طلبات توثيق معلقة حالياً.');
            break;
          }
          for (const v of pending) {
            await this.sendMessage(env, chatId,
              `✔️ <b>طلب توثيق</b>\n` +
              `المستخدم: <code>${this.esc(v.userId || v.id)}</code>\n` +
              `الفئة: ${this.esc(v.tier || 'غير محدد')}\n` +
              `الاسم: ${this.esc(v.data?.fullName || '—')}\n` +
              `افتح لوحة التحكم لاتخاذ قرار.`,
              { reply_markup: { inline_keyboard: [[{ text: '🖥️ فتح لوحة التحكم', url: 'https://mstkhby.com/admin' }]] } }
            );
          }
        } catch (err) {
          await this.sendMessage(env, chatId, `❌ تعذر جلب طلبات التوثيق: ${this.esc(err.message)}`);
        }
        break;
      }

      case '/ban': {
        const [userId, ...reasonParts] = args;
        if (!userId) {
          await this.sendMessage(env, chatId, 'الاستخدام: <code>/ban user_id السبب</code>');
          break;
        }
        const fakeRequest = {
          json: async () => ({ userId, reason: reasonParts.join(' ') || 'مخالفة قواعد المنصة' })
        };
        const result = await api.adminBanUser(fakeRequest, userId);
        const body = await result.json();
        if (!body.success) {
          await this.sendMessage(env, chatId, `❌ ${this.esc(body.error || 'تعذر الحظر')}`);
          break;
        }
        await this.sendMessage(env, chatId, `⛔ تم حظر المستخدم <code>${this.esc(userId)}</code>.`);
        break;
      }

      case '/unban': {
        const [userId] = args;
        if (!userId) {
          await this.sendMessage(env, chatId, 'الاستخدام: <code>/unban user_id</code>');
          break;
        }
        try {
          await api.adminUnbanUser(userId);
          await this.sendMessage(env, chatId, `✅ تم إلغاء حظر المستخدم <code>${this.esc(userId)}</code>.`);
        } catch (err) {
          await this.sendMessage(env, chatId, `❌ تعذر إلغاء الحظر: ${this.esc(err.message)}`);
        }
        break;
      }

      default:
        await this.sendMessage(env, chatId, 'أمر غير معروف. أرسل /help لعرض الأوامر المتاحة.');
    }

    FirebaseAdmin.logActivity(env, { type: 'bot_command', text: `أمر من الأدمن عبر تيليجرام: ${this.esc(command)}` });
  },

  async handleCallbackQuery(cq, env, api) {
    const chatId = cq.message?.chat?.id;
    if (!this.isFromAdmin(env, chatId)) {
      await this.answerCallbackQuery(env, cq.id, 'غير مصرح لك.', true);
      return;
    }

    const [scope, action, id] = (cq.data || '').split(':');

    if (scope === 'report') {
      const fakeRequest = {
        json: async () => ({ reportId: id, action: action === 'approve' ? 'approve' : 'dismiss' })
      };
      try {
        await api.adminHandleReport(fakeRequest, id);
        await this.answerCallbackQuery(env, cq.id, action === 'approve' ? '✅ تم القبول' : '❌ تم التجاهل');
        await this.editMessageText(env, chatId, cq.message.message_id,
          `${cq.message.text}\n\n<b>${action === 'approve' ? '✅ تمت الموافقة على الإجراء' : '❌ تم تجاهل البلاغ'}</b>`
        );
      } catch (err) {
        await this.answerCallbackQuery(env, cq.id, `❌ فشل: ${err.message}`, true);
      }
    }
  }
};

export default TelegramBot;
