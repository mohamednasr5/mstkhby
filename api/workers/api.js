// api.js
import TelegramBot from "./telegram-bot.js";

var MstkhbyAPI = {
  // NOTE: real config comes from Cloudflare (wrangler.toml `[vars]` +
  // `wrangler secret put ...`), injected per-request as `env` and
  // stored on `this.env` in handleRequest() below. Nothing is
  // hardcoded here — set actual values with:
  //   wrangler secret put ADMIN_TOKEN
  // and by editing the [vars] section of wrangler.toml.
  // CORS headers
  corsHeaders: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
    "Access-Control-Max-Age": "86400"
  },
  /**
   * Main request handler
   */
  async handleRequest(request2, env, ctx) {
    this.env = env;
    this.ctx = ctx;
    if (request2.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: this.corsHeaders });
    }
    const url = new URL(request2.url);
    const path = url.pathname;
    try {
      if (path.startsWith("/api/telegram/")) {
        return await this.handleTelegram(request2, path, env);
      }
      if (path.startsWith("/api/auth/")) {
        return await this.handleAuth(request2, path);
      }
      if (path.startsWith("/api/messages/")) {
        return await this.handleMessages(request2, path);
      }
      if (path.startsWith("/api/moderate/")) {
        return await this.handleModeration(request2, path, env);
      }
      if (path.startsWith("/api/media/")) {
        return await this.handleMedia(request2, path, env);
      }
      if (path.startsWith("/api/admin/")) {
        return await this.handleAdmin(request2, path);
      }
      if (path.startsWith("/api/users/")) {
        return await this.handleUsers(request2, path);
      }
      return this.jsonResponse({ error: "Not Found" }, 404);
    } catch (error) {
      console.error("API Error:", error);
      return this.jsonResponse({
        error: "Internal Server Error",
        message: error.message
      }, 500);
    }
  },
  // ==================== TELEGRAM BOT ====================
  async handleTelegram(request2, path, env) {
    switch (path) {
      case "/api/telegram/webhook":
        // Telegram webhook — receives every message/button-tap sent to
        // the bot. See telegram-bot.js for the full command handling.
        return await TelegramBot.handleWebhook(request2, env, this);

      case "/api/telegram/set-webhook": {
        // One-off setup helper: hit this URL once (protected by
        // X-Admin-Token) to register the webhook with Telegram. Not
        // needed on every request — see README.md for the plain curl
        // alternative.
        const isAdmin = await this.authenticateAdmin(request2);
        if (!isAdmin) return this.jsonResponse({ error: "Admin access required" }, 403);
        const url = new URL(request2.url);
        const webhookUrl = `${url.origin}/api/telegram/webhook`;
        const result = await TelegramBot.setWebhook(env, webhookUrl);
        return this.jsonResponse({ success: true, webhookUrl, telegram: result });
      }

      default:
        return this.jsonResponse({ error: "Telegram endpoint not found" }, 404);
    }
  },
  // ==================== AUTH ENDPOINTS ====================
  async handleAuth(request2, path) {
    switch (path) {
      case "/api/auth/register":
        return await this.register(request2);
      case "/api/auth/login":
        return await this.login(request2);
      case "/api/auth/logout":
        return await this.logout(request2);
      case "/api/auth/refresh":
        return await this.refreshToken(request2);
      case "/api/auth/reset-password":
        return await this.resetPassword(request2);
      default:
        return this.jsonResponse({ error: "Auth endpoint not found" }, 404);
    }
  },
  async register(request2) {
    const data = await request2.json();
    const { email, password, displayName, username } = data;
    if (!email || !password || !displayName || !username) {
      return this.jsonResponse({ error: "Missing required fields" }, 400);
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return this.jsonResponse({ error: "Invalid email format" }, 400);
    }
    if (password.length < 8) {
      return this.jsonResponse({ error: "Password must be at least 8 characters" }, 400);
    }
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return this.jsonResponse({ error: "Username must be 3-20 alphanumeric characters" }, 400);
    }
    const userData = {
      id: `user_${Date.now()}`,
      email,
      displayName,
      username: username.toLowerCase(),
      profileUrl: `mstkhby.com/${username.toLowerCase()}`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      plan: "free",
      settings: {
        privacyLevel: "medium",
        allowMessages: true,
        allowMedia: true,
        notifications: { push: true, email: false }
      },
      stats: {
        totalMessagesReceived: 0,
        totalReactions: 0
      },
      status: "active"
    };
    const token = this.generateToken(userData);
    return this.jsonResponse({
      success: true,
      message: "User registered successfully",
      user: {
        id: userData.id,
        email: userData.email,
        displayName: userData.displayName,
        username: userData.username,
        profileUrl: userData.profileUrl
      },
      token
    }, 201);
  },
  async login(request2) {
    const data = await request2.json();
    const { email, password } = data;
    if (!email || !password) {
      return this.jsonResponse({ error: "Email and password required" }, 400);
    }
    const userData = {
      id: `user_${Date.now()}`,
      email,
      displayName: "Demo User",
      username: email.split("@")[0],
      profileUrl: `mstkhby.com/${email.split("@")[0]}`,
      plan: "free"
    };
    const token = this.generateToken(userData);
    return this.jsonResponse({
      success: true,
      message: "Login successful",
      user: userData,
      token
    });
  },
  async logout(request2) {
    return this.jsonResponse({
      success: true,
      message: "Logged out successfully"
    });
  },
  async refreshToken(request2) {
    const authHeader = request2.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return this.jsonResponse({ error: "No token provided" }, 401);
    }
    const oldToken = authHeader.substring(7);
    const payload = this.verifyToken(oldToken);
    if (!payload) {
      return this.jsonResponse({ error: "Invalid token" }, 401);
    }
    const newToken = this.generateToken(payload);
    return this.jsonResponse({
      success: true,
      token: newToken
    });
  },
  async resetPassword(request2) {
    const data = await request2.json();
    const { email } = data;
    if (!email) {
      return this.jsonResponse({ error: "Email required" }, 400);
    }
    return this.jsonResponse({
      success: true,
      message: "Password reset email sent"
    });
  },
  // ==================== MODERATION ENDPOINTS ====================
  // Powered by NVIDIA's nemotron-3.5-content-safety model — checks
  // both text and images (documents/media before they're published).
  async handleModeration(request2, path, env) {
    switch (true) {
      case (path === "/api/moderate/text" && request2.method === "POST"):
        return await this.moderateTextEndpoint(request2, env);
      case (path === "/api/moderate/media" && request2.method === "POST"):
        return await this.moderateMediaEndpoint(request2, env);
      default:
        return this.jsonResponse({ error: "Moderation endpoint not found" }, 404);
    }
  },
  async moderateTextEndpoint(request2, env) {
    const data = await request2.json();
    const { content } = data;
    if (!content || typeof content !== "string") {
      return this.jsonResponse({ error: "Content is required" }, 400);
    }
    const result = await this.moderateWithNvidia({ text: content, env });
    return this.jsonResponse({ success: true, ...result });
  },
  async moderateMediaEndpoint(request2, env) {
    const data = await request2.json();
    const { url } = data;
    if (!url) {
      return this.jsonResponse({ error: "Media URL is required" }, 400);
    }
    const result = await this.moderateWithNvidia({ imageUrl: url, env });
    return this.jsonResponse({ success: true, ...result });
  },
  /**
   * Calls NVIDIA's hosted content-safety model (nemotron-3.5-content-safety)
   * via the standard OpenAI-compatible chat completions endpoint. Supports
   * text, an image, or both in the same call, and multiple languages
   * including Arabic. Docs: https://build.nvidia.com/nvidia/nemotron-3.5-content-safety
   *
   * Fails CLOSED (blocks) on any error or missing API key — content
   * should never be published unmoderated just because the check failed.
   */
  async moderateWithNvidia({ text = null, imageUrl = null, env }) {
    if (!env?.NVIDIA_API_KEY) {
      console.error("NVIDIA_API_KEY not configured \u2014 blocking by default");
      this.ctx?.waitUntil?.(TelegramBot.notifyModerationDegraded(env, "NVIDIA_API_KEY \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637"));
      return {
        allowed: false,
        reason: "\u062E\u062F\u0645\u0629 \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u062D\u0627\u0644\u064A\u0627\u064B\u060C \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649 \u0644\u0627\u062D\u0642\u0627\u064B",
        severity: "error"
      };
    }
    try {
      const userContent = [];
      if (text) userContent.push({ type: "text", text });
      if (imageUrl) userContent.push({ type: "image_url", image_url: { url: imageUrl } });
      if (userContent.length === 0) {
        return { allowed: true, severity: "safe" };
      }
      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.NVIDIA_API_KEY}`
        },
        body: JSON.stringify({
          model: "nvidia/nemotron-3.5-content-safety",
          // Single text-only message can be a plain string; mixed
          // text+image needs the multimodal content-array form.
          messages: [{
            role: "user",
            content: userContent.length === 1 && text && !imageUrl ? text : userContent
          }],
          max_tokens: 200,
          stream: false
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error("NVIDIA moderation API error:", response.status, errText);
        this.ctx?.waitUntil?.(TelegramBot.notifyModerationDegraded(env, `NVIDIA API ${response.status}`));
        return {
          allowed: false,
          reason: "\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0645\u062D\u062A\u0648\u0649\u060C \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649",
          severity: "error"
        };
      }
      const result = await response.json();
      const verdictText = result.choices?.[0]?.message?.content || "";
      const isUnsafe = /User Safety:\s*unsafe/i.test(verdictText) || /Response Safety:\s*unsafe/i.test(verdictText);
      const categoriesMatch = verdictText.match(/Safety Categories:\s*(.+)/i);
      const categories = categoriesMatch ? categoriesMatch[1].trim() : null;

      if (isUnsafe) {
        // Real-time admin alert — fired via waitUntil so it never
        // delays the actual moderation response to the caller.
        this.ctx?.waitUntil?.(TelegramBot.notifyBlockedContent(env, {
          kind: imageUrl ? "image" : "text",
          reason: "\u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u064A\u062E\u0627\u0644\u0641 \u0633\u064A\u0627\u0633\u0629 \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645",
          categories,
          preview: text || imageUrl
        }));
      }

      return {
        allowed: !isUnsafe,
        reason: isUnsafe ? `\u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u064A\u062E\u0627\u0644\u0641 \u0633\u064A\u0627\u0633\u0629 \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645${categories ? " \u2014 " + categories : ""}` : null,
        severity: isUnsafe ? "high" : "safe",
        categories
      };
    } catch (error) {
      console.error("NVIDIA moderation call failed:", error);
      this.ctx?.waitUntil?.(TelegramBot.notifyModerationDegraded(env, error.message));
      return {
        allowed: false,
        reason: "\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0645\u062D\u062A\u0648\u0649\u060C \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649",
        severity: "error"
      };
    }
  },
  // ==================== MESSAGES ENDPOINTS ====================
  async handleMessages(request2, path) {
    const user = await this.authenticateUser(request2);
    if (!user && !path.includes("/public/")) {
      return this.jsonResponse({ error: "Unauthorized" }, 401);
    }
    switch (true) {
      case (path === "/api/messages/send" && request2.method === "POST"):
        return await this.sendMessage(request2, user);
      case (path === "/api/messages/inbox" && request2.method === "GET"):
        return await this.getInbox(user);
      case (path.match(/^\/api\/messages\/[^\/]+$/) && request2.method === "GET"):
        const messageId = path.split("/")[3];
        return await this.getMessage(messageId, user);
      case (path.match(/^\/api\/messages\/[^\/]+$/) && request2.method === "DELETE"):
        const deleteId = path.split("/")[3];
        return await this.deleteMessage(deleteId, user);
      case (path.match(/^\/api\/messages\/[^\/]+\/react/) && request2.method === "POST"):
        const reactMsgId = path.split("/")[3];
        return await this.addReaction(reactMsgId, request2, user);
      case (path.match(/^\/api\/messages\/[^\/]+\/reply/) && request2.method === "POST"):
        const replyMsgId = path.split("/")[3];
        return await this.replyToMessage(replyMsgId, request2, user);
      case (path === "/api/messages/public/send" && request2.method === "POST"):
        return await this.sendPublicMessage(request2);
      default:
        return this.jsonResponse({ error: "Messages endpoint not found" }, 404);
    }
  },
  async sendMessage(request2, sender) {
    const data = await request2.json();
    const { recipientId, content, messageType, identity, alias, destructOption } = data;
    if (!recipientId || !content) {
      return this.jsonResponse({ error: "Recipient ID and content required" }, 400);
    }
    const moderationResult = await this.moderateContent(content, this.env);
    if (!moderationResult.allowed) {
      return this.jsonResponse({
        error: "Content not allowed",
        reason: moderationResult.reason
      }, 400);
    }
    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recipientId,
      senderId: sender?.id || null,
      content: this.sanitizeContent(content),
      messageType: messageType || "text",
      identity: identity || "anonymous",
      alias: identity === "alias" ? alias : null,
      destructOption: destructOption || "normal",
      status: "delivered",
      isRead: false,
      moderationResult,
      senderFingerprint: this.generateFingerprint(request2),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      expiresAt: this.calculateExpiry(destructOption)
    };
    return this.jsonResponse({
      success: true,
      messageId: message.id,
      message: "Message sent successfully"
    }, 201);
  },
  async getInbox(user) {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const filter = url.searchParams.get("filter") || "all";
    const startAfter = url.searchParams.get("startAfter");
    const messages = [];
    return this.jsonResponse({
      success: true,
      messages,
      hasMore: messages.length === limit,
      total: messages.length
    });
  },
  async getMessage(messageId, user) {
    return this.jsonResponse({
      success: true,
      message: {}
      // Message data
    });
  },
  async deleteMessage(messageId, user) {
    return this.jsonResponse({
      success: true,
      message: "Message deleted"
    });
  },
  async addReaction(messageId, request2, user) {
    const data = await request2.json();
    const { reactionType } = data;
    const allowedReactions = ["love", "funny", "shocking", "sad", "fire", "agree"];
    if (!allowedReactions.includes(reactionType)) {
      return this.jsonResponse({ error: "Invalid reaction type" }, 400);
    }
    return this.jsonResponse({
      success: true,
      message: "Reaction added"
    });
  },
  async replyToMessage(messageId, request2, user) {
    const data = await request2.json();
    const { content, identity } = data;
    const reply = {
      id: `reply_${Date.now()}`,
      originalMessageId: messageId,
      senderId: user.id,
      content: this.sanitizeContent(content),
      identity: identity || "anonymous",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return this.jsonResponse({
      success: true,
      replyId: reply.id,
      message: "Reply sent"
    }, 201);
  },
  async sendPublicMessage(request2) {
    const data = await request2.json();
    const { recipientUsername, content, identity, alias } = data;
    return this.jsonResponse({
      success: true,
      message: "Public message sent"
    }, 201);
  },
  // ==================== MEDIA ENDPOINTS ====================
  async handleMedia(request2, path, env) {
    const user = await this.authenticateUser(request2);
    switch (true) {
      case (path === "/api/media/upload" && request2.method === "POST"):
        return await this.uploadMedia(request2, user, env);
      case (path.match(/^\/api\/media\/(.+)$/) && request2.method === "DELETE"):
        if (!user) {
          return this.jsonResponse({ error: "Unauthorized" }, 401);
        }
        const mediaKey = path.replace("/api/media/", "");
        return await this.deleteMedia(mediaKey, user, env);
      default:
        return this.jsonResponse({ error: "Media endpoint not found" }, 404);
    }
  },
  async uploadMedia(request2, user, env) {
    const formData = await request2.formData();
    const file = formData.get("file");
    const messageId = formData.get("messageId");
    const category = formData.get("category") || (messageId ? "messages" : "uploads");
    if (!file) {
      return this.jsonResponse({ error: "No file provided" }, 400);
    }
    if (!messageId && !user) {
      return this.jsonResponse({ error: "Unauthorized" }, 401);
    }
    const maxSize = 50 * 1024 * 1024;
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/webm"
    ];
    if (!allowedTypes.includes(file.type)) {
      return this.jsonResponse({ error: "File type not allowed" }, 400);
    }
    if (file.size > maxSize) {
      return this.jsonResponse({ error: "File too large (max 50MB)" }, 400);
    }
    const safeExt = (file.name?.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const randomPart = crypto.randomUUID();
    const key = messageId ? `${category}/${messageId}/${randomPart}.${safeExt}` : `${category}/${user.id}/${randomPart}.${safeExt}`;
    await env.R2_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type
      }
    });
    const url = `${env.R2_PUBLIC_URL}/${key}`;
    if (file.type.startsWith("image/")) {
      const moderation = await this.moderateWithNvidia({ imageUrl: url, env });
      if (!moderation.allowed) {
        await env.R2_BUCKET.delete(key);
        this.ctx?.waitUntil?.(TelegramBot.notifyMediaRejected(env, { reason: moderation.reason, key }));
        return this.jsonResponse({
          error: "Content not allowed",
          reason: moderation.reason
        }, 400);
      }
    }
    return this.jsonResponse({
      success: true,
      url,
      key,
      type: file.type.startsWith("image/") ? "image" : "video",
      size: file.size
    }, 201);
  },
  async deleteMedia(mediaKey, user, env) {
    const decodedKey = decodeURIComponent(mediaKey);
    await env.R2_BUCKET.delete(decodedKey);
    return this.jsonResponse({
      success: true,
      message: "Media deleted"
    });
  },
  // ==================== ADMIN ENDPOINTS ====================
  async handleAdmin(request2, path) {
    const isAdmin = await this.authenticateAdmin(request2);
    if (!isAdmin) {
      return this.jsonResponse({ error: "Admin access required" }, 403);
    }
    switch (true) {
      case (path === "/admin/users" && request2.method === "GET"):
        return await this.adminGetUsers(request2);
      case (path === "/admin/users/stats" && request2.method === "GET"):
        return await this.adminGetStats();
      case (path === "/admin/messages" && request2.method === "GET"):
        return await this.adminGetMessages(request2);
      case (path === "/admin/reports" && request2.method === "GET"):
        return await this.adminGetReports(request2);
      case (path === "/admin/reports/:id/action" && request2.method === "POST"):
        return await this.adminHandleReport(request2);
      case (path === "/admin/users/:id/ban" && request2.method === "POST"):
        return await this.adminBanUser(request2);
      case (path === "/admin/content/moderate" && request2.method === "POST"):
        return await this.adminModerateContent(request2);
      default:
        return this.jsonResponse({ error: "Admin endpoint not found" }, 404);
    }
  },
  async adminGetUsers(request2) {
    const url = new URL(request2.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const search = url.searchParams.get("search");
    return this.jsonResponse({
      success: true,
      users: [],
      // User list
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0
      }
    });
  },
  async adminGetStats() {
    const stats = {
      totalUsers: 15e4,
      activeUsersToday: 12500,
      totalMessages: 2e6,
      messagesToday: 45e3,
      premiumUsers: 2500,
      reportsPending: 15,
      averageMessagesPerUser: 13.3,
      topCountries: ["Saudi Arabia", "Egypt", "UAE", "Kuwait", "Iraq"],
      growthRate: "+12.5%"
    };
    return this.jsonResponse({
      success: true,
      stats
    });
  },
  async adminGetMessages(request2) {
    const url = new URL(request2.url);
    const filter = url.searchParams.get("filter");
    const page = parseInt(url.searchParams.get("page") || "1");
    return this.jsonResponse({
      success: true,
      messages: [],
      pagination: { page, total: 0 }
    });
  },
  async adminGetReports(request2) {
    const url = new URL(request2.url);
    const status = url.searchParams.get("status");
    return this.jsonResponse({
      success: true,
      reports: []
    });
  },
  async adminHandleReport(request2) {
    const data = await request2.json();
    const { reportId, action, notes } = data;
    return this.jsonResponse({
      success: true,
      message: `Report ${action}d`
    });
  },
  async adminBanUser(request2) {
    const data = await request2.json();
    const { userId, reason, duration } = data;
    this.ctx?.waitUntil?.(TelegramBot.notifyUserBanned(this.env, { userId, reason, duration }));
    return this.jsonResponse({
      success: true,
      message: "User banned"
    });
  },
  async adminModerateContent(request2) {
    const data = await request2.json();
    const { messageId, action } = data;
    return this.jsonResponse({
      success: true,
      message: `Content ${action}d`
    });
  },
  // ==================== USERS ENDPOINTS ====================
  async handleUsers(request2, path) {
    switch (true) {
      case (path.match(/^\/api\/users\/[^\/]+$/) && request2.method === "GET"):
        const username = path.split("/")[3];
        return await this.getUserByUsername(username);
      case (path === "/api/users/me" && request2.method === "GET"):
        const user = await this.authenticateUser(request2);
        return await this.getCurrentUser(user);
      case (path === "/api/users/me" && request2.method === "PUT"):
        const authUser = await this.authenticateUser(request2);
        return await this.updateProfile(request2, authUser);
      default:
        return this.jsonResponse({ error: "Users endpoint not found" }, 404);
    }
  },
  async getUserByUsername(username) {
    return this.jsonResponse({
      success: true,
      user: {
        // Public user data only
        id: "",
        displayName: "",
        username: "",
        avatar: null,
        isVerified: false,
        joinDate: ""
      }
    });
  },
  async getCurrentUser(user) {
    return this.jsonResponse({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        username: user.username,
        photoURL: user.photoURL,
        plan: user.plan,
        settings: user.settings,
        stats: user.stats
      }
    });
  },
  async updateProfile(request2, user) {
    const data = await request2.json();
    const allowedUpdates = ["displayName", "photoURL", "settings"];
    const updates = {};
    for (const field of allowedUpdates) {
      if (data[field] !== void 0) {
        updates[field] = data[field];
      }
    }
    return this.jsonResponse({
      success: true,
      message: "Profile updated",
      updates
    });
  },
  // ==================== AUTHENTICATION HELPERS ====================
  async authenticateUser(request2) {
    const authHeader = request2.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }
    const token = authHeader.substring(7);
    return this.verifyToken(token);
  },
  async authenticateAdmin(request2) {
    const adminToken = request2.headers.get("X-Admin-Token");
    if (adminToken && this.env?.ADMIN_TOKEN && adminToken === this.env.ADMIN_TOKEN) {
      return true;
    }
    const user = await this.authenticateUser(request2);
    return user?.claims?.admin === true;
  },
  // Verifies a real Firebase Auth ID token server-side via the
  // Identity Toolkit REST API (no crypto library needed in Workers).
  // Docs: https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/lookup
  async verifyToken(idToken) {
    try {
      if (!idToken || !this.env?.FIREBASE_API_KEY) return null;
      const resp = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${this.env.FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken })
        }
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      const account = data.users?.[0];
      if (!account) return null;
      return {
        id: account.localId,
        email: account.email,
        emailVerified: account.emailVerified,
        displayName: account.displayName,
        claims: account.customAttributes ? JSON.parse(account.customAttributes) : {}
      };
    } catch (error) {
      console.error("Token verification failed:", error);
      return null;
    }
  },
  // ==================== UTILITY METHODS ====================
  jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        ...this.corsHeaders,
        "Content-Type": "application/json"
      }
    });
  },
  sanitizeContent(content) {
    return content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  },
  async moderateContent(content, env) {
    return this.moderateWithNvidia({ text: content, env });
  },
  calculateExpiry(option) {
    const now = /* @__PURE__ */ new Date();
    switch (option) {
      case "10sec":
        return new Date(now.getTime() + 10 * 1e3).toISOString();
      case "30sec":
        return new Date(now.getTime() + 30 * 1e3).toISOString();
      case "1hour":
        return new Date(now.getTime() + 60 * 60 * 1e3).toISOString();
      case "24hours":
        return new Date(now.getTime() + 24 * 60 * 60 * 1e3).toISOString();
      default:
        return null;
    }
  },
  generateFingerprint(request2) {
    const ip = request2.headers.get("CF-Connecting-IP") || "";
    const userAgent = request2.headers.get("User-Agent") || "";
    const acceptLang = request2.headers.get("Accept-Language") || "";
    const raw = `${ip}-${userAgent}-${acceptLang}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
};
var api_default = {
  async fetch(request2, env, ctx) {
    return MstkhbyAPI.handleRequest(request2, env, ctx);
  }
};
export {
  api_default as default
};
//# sourceMappingURL=api.js.map
