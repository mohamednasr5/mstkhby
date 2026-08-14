# 🤫 مستخبي (Mstkhby) - منصة الرسائل السرية

منصة عربية متكاملة لإرسال واستقبال الرسائل السرية والمجهولة مع خيارات متعددة للهوية والخصوصية.

## ✨ المميزات الرئيسية

### 👤 للمستخدمين
- **إرسال بدون حساب** - المرسل لا يحتاج لتسجيل
- **رابط شخصي فريد** - `mstkhby.com/اسمك`
- **مستويات سرية متعددة** - مجهول / مستعار / معروف / اكشف لاحقاً
- **رسائل ذاتية التدمير** - مشاهدة واحدة أو بعد وقت محدد
- **وسائط متعددة** - نص، صور، فيديو
- **ردود مجهولة** - رد مع الحفاظ على هويتك
- **تفاعلات** - ❤️ 😂 😮 💪 بدون كشف الهوية

### 🛡️ الأمان والخصوصية
- **AI Moderation** - فحص تلقائي للمحتوى
- **تشفير** - حماية البيانات
- **حظر ذكي** - حماية من الإزعاج
- **إشعارات آمنة** - بدون كشف المحتوى

### 👨‍💼 لوحة تحكم الأدمن
- **إدارة المستخدمين** - عرض/تعديل/حظر
- **مراقبة الرسائل** - فحص وتعديل
- **البلاغات** - معالجة البلاغات
- **التحليلات** - إحصائيات مفصلة
- **الإعدادات** - تحكم كامل بالمنصة

## 🛠️ التقنيات المستخدمة

### Frontend
- **HTML5 + CSS3 + JavaScript** (Vanilla)
- **Firebase** (Auth, Firestore, Storage)
- **PWA Support**

### Backend API
- **Cloudflare Workers**
- **R2 Storage** للوسائط
- **RESTful API**

### قاعدة البيانات
- **Firestore** (Firebase)
- **Real-time Updates**

## 📁 هيكل المشروع

```
mstkhby/
├── index.html              # الصفحة الرئيسية
├── css/
│   ├── main.css           # الأنماط الأساسية
│   ├── components.css    # المكونات
│   ├── animations.css    # الحركات
│   └── responsive.css    # التجاوب
├── js/
│   ├── firebase-config.js # إعدادات Firebase
│   ├── auth.js            # المصادقة
│   ├── ui.js              # واجهة المستخدم
│   ├── messages.js        # خدمة الرسائل
│   ├── storage.js         # خدمة التخزين
│   └── app.js             # التطبيق الرئيسي
├── admin/
│   ├── index.html         # لوحة التحكم
│   ├── css/admin.css      # أنماط لوحة التحكم
│   └── js/admin.js        # سكربت لوحة التحكم
├── api/workers/
│   └── api.js             # Cloudflare Workers API
└── assets/
    └── icons/favicon.svg  # أيقونة الموقع
```

## 🚀 التشغيل المحلي

1. **تثبيت المتطلبات**
   ```bash
   # Node.js 18+
   # Firebase CLI
   npm install -g firebase-tools
   ```

2. **إعداد Firebase**
   ```bash
   firebase login
   firebase init
   ```

3. **تحديث إعدادات Firebase**
   ```javascript
   // في ملف js/firebase-config.js
   const firebaseConfig = {
       apiKey: "YOUR_API_KEY",
       authDomain: "your-project.firebaseapp.com",
       projectId: "your-project-id",
       storageBucket: "your-project.appspot.com"
   };
   ```

4. **تشغيل محلياً**
   ```bash
   # باستخدام Live Server أو أي server محلي
   # أو
   npx serve .
   ```

5. **لوحة التحكم**
   ```
   افتح admin/index.html في المتصفح
   ```

## 🔧 إعداد Cloudflare Workers

1. **إنشاء مشروع Workers**
   ```bash
   wrangler init mstkhby-api
   ```

2. **نسخ ملف API**
   ```bash
   cp api/workers/api.js mstkhby-api/src/index.js
   ```

3. **إعدادات R2**
   ```bash
   wrangler r2 bucket create mstkhby-media
   ```

4. **نشر**
   ```bash
   wrangler deploy
   ```

## 📱 PWA Support

التطبيق يدعم:
- **Offline Support** - عمل بدون إنترنت
- **Installable** - تثبيت على الهاتف
- **Push Notifications** - إشعارات فورية
- **App-like Experience** - تجربة تطبيق حقيقي

## 🔐 الأمان

- **CORS Protection** - حماية طلبات المتصفح
- **XSS Prevention** - منع حقن الأكواد
- **Content Security Policy** - سياسة محتوى صارمة
- **Rate Limiting** - تحديد الطلبات
- **Input Validation** - التحقق من المدخلات

## 📊 Analytics & Monitoring

- **User Growth** - نمو المستخدمين
- **Message Stats** - إحصائيات الرسائل
- **Geographic Data** - توزيع جغرافي
- **Engagement Metrics** - مقاييس التفاعل

## 🌐 اللغات المدعومة

- **العربية** (الافتراضية)
- **English** (قريباً)

## 📄 الترخيص

MIT License - حرية الاستخدام والتعديل

## 👥 المساهمة

نرحب بمساهماتكم! يرجى:
1. Fork المشروع
2. إنشاء فرع جديد (`git checkout -b feature/amazing-feature`)
3. Commit التغييرات (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing-feature`)
5. Pull Request

## 🆘 الدعم

- [البريد الإلكتروني](mailto:support@mstkhby.com)
- [Telegram](https://t.me/mstkhby_support)

---

**مستخبي** - أرسل ما تريد قوله، بالطريقة التي تريدها 🤫

Made with ❤️ for the Arab world
