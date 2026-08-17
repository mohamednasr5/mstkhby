// firebase-admin.js
// ============================================================
// Minimal Firebase Admin REST client for Cloudflare Workers.
// ============================================================
// Cloudflare Workers can't run the Node.js firebase-admin SDK, so this
// mints its own Google OAuth2 access token from a service-account
// private key (RS256 JWT, signed with the Web Crypto API — no
// dependencies) and uses it to call the Realtime Database REST API.
// A token from a service account with database access bypasses
// database.rules.json entirely, exactly like the Admin SDK does —
// this is what lets the Worker (admin stats, bans, report handling,
// the Telegram bot) read/write privileged paths the public rules
// block for anonymous/client requests.
//
// SETUP (one-time):
//   1) Firebase Console → Project settings (⚙️) → Service accounts
//   2) "Generate new private key" → downloads a JSON file
//   3) Copy the ENTIRE file content, then:
//        wrangler secret put FIREBASE_SERVICE_ACCOUNT_KEY
//      (paste the whole JSON as the secret value)
//   Needs FIREBASE_PROJECT_ID in [vars] — already set in wrangler.toml.

const FirebaseAdmin = {
  _tokenCache: null, // { token, expiresAt }

  async getAccessToken(env) {
    if (this._tokenCache && this._tokenCache.expiresAt > Date.now() + 60000) {
      return this._tokenCache.token;
    }
    if (!env?.FIREBASE_SERVICE_ACCOUNT_KEY) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY غير مضبوط');
    }
    let sa;
    try {
      sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY ليس JSON صالح');
    }

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    };

    const b64url = (bytes) => {
      let str = typeof bytes === 'string' ? btoa(bytes) : btoa(String.fromCharCode(...new Uint8Array(bytes)));
      return str.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    };
    const encodeJson = (obj) => b64url(JSON.stringify(obj));

    const unsigned = `${encodeJson(header)}.${encodeJson(claim)}`;
    const key = await this._importPrivateKey(sa.private_key);
    const sigBuf = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      new TextEncoder().encode(unsigned)
    );
    const jwt = `${unsigned}.${b64url(sigBuf)}`;

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`
    });
    if (!resp.ok) {
      throw new Error(`تعذر الحصول على رمز وصول Google: ${resp.status} ${await resp.text()}`);
    }
    const data = await resp.json();
    this._tokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    return data.access_token;
  },

  async _importPrivateKey(pem) {
    const body = pem
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s+/g, '');
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return crypto.subtle.importKey(
      'pkcs8',
      bytes.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
  },

  dbUrl(env, path, query = '') {
    const projectId = env.FIREBASE_PROJECT_ID;
    return `https://${projectId}-default-rtdb.firebaseio.com${path}.json${query ? `?${query}` : ''}`;
  },

  async request(env, method, path, { query = '', body } = {}) {
    const token = await this.getAccessToken(env);
    const resp = await fetch(this.dbUrl(env, path, query), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!resp.ok) {
      throw new Error(`Firebase ${method} ${path} فشل: ${resp.status} ${await resp.text()}`);
    }
    return resp.json();
  },

  get(env, path, query = '') {
    return this.request(env, 'GET', path, { query });
  },
  patch(env, path, body) {
    return this.request(env, 'PATCH', path, { body });
  },
  put(env, path, body) {
    return this.request(env, 'PUT', path, { body });
  },
  post(env, path, body) {
    return this.request(env, 'POST', path, { body });
  },
  delete(env, path) {
    return this.request(env, 'DELETE', path, {});
  },

  /** Cheap child count without downloading values. */
  async count(env, path) {
    const data = await this.get(env, path, 'shallow=true');
    return data ? Object.keys(data).length : 0;
  },

  /** Count children matching orderByChild==value (needs .indexOn in database.rules.json). */
  async countWhere(env, path, child, value) {
    const query = `orderBy=${encodeURIComponent(JSON.stringify(child))}&equalTo=${encodeURIComponent(JSON.stringify(value))}&shallow=true`;
    const data = await this.get(env, path, query);
    return data ? Object.keys(data).length : 0;
  },

  /** Fetch children matching orderByChild==value, most-recent-first, capped at `limit`. */
  async listWhere(env, path, child, value, limit = 20) {
    const query = `orderBy=${encodeURIComponent(JSON.stringify(child))}&equalTo=${encodeURIComponent(JSON.stringify(value))}&limitToLast=${limit}`;
    const data = await this.get(env, path, query);
    if (!data) return [];
    return Object.entries(data)
      .map(([id, val]) => ({ id, ...val }))
      .reverse();
  },

  /** Log a compact entry admins can see in the "بوت تيليجرام" dashboard tab. Never throws. */
  async logActivity(env, entry) {
    try {
      await this.post(env, '/botActivity', {
        ...entry,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('logActivity failed:', err.message);
    }
  }
};

export default FirebaseAdmin;
