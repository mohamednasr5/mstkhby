# ملاحظات التنفيذ (Deployment Notes)

## 1) لوحة الأدمن — الدخول المقيد بجوجل
- الدخول الآن عبر Google Sign-In فقط، ومسموح فقط لـ:
  - elfannanm@gmail.com
  - mohamednasrofficial@gmail.com
- **مهم جداً:** لازم تفعّل "Google" كـ Sign-in provider من Firebase Console
  (Authentication → Sign-in method → Google → Enable)، وتضيف نطاق
  `mstkhby.com` (و`localhost` للتجربة) في Authorized domains.
- الحماية الحقيقية موجودة في `database.rules.json` (وليس فقط في الواجهة).
  لازم تنشر هذا الملف فعلياً:
  ```
  firebase deploy --only database
  ```
  بدون هذه الخطوة أي حد عنده حساب Firebase يقدر يقرأ/يكتب البيانات مباشرة
  حتى لو مش قادر يفتح صفحة الأدمن.

## 2) الإحصائيات الحقيقية
- كل الأرقام في `admin/js/admin.js` بتتقرأ مباشرة من Realtime Database
  (users, messages, reports) — مفيش أي بيانات وهمية.
- ملحوظة أداء: مع نمو قاعدة البيانات لعشرات الآلاف من المستخدمين، القراءة
  الكاملة لعقدة `users` و `messages` في كل مرة هتبقى تقيلة. الحل الأمثل
  مستقبلاً هو إضافة Cloud Function تحسب العدادات (aggregation) وتخزنها في
  `stats/` عشان لوحة الأدمن تقرأ رقم واحد بدل كل السجلات.
- بيانات جغرافية (الدولة) مش موجودة في السكيمة الحالية، فتم حذف الرسم
  البياني الخاص بيها بدل ما نخترع أرقام.

## 3) PWA — تثبيت حقيقي
- `manifest.json` + `sw.js` محدّثين بالكامل ويحققان شروط التثبيت الحقيقي
  (installability) في Chrome / Edge / Android / أغلب متصفحات سطح المكتب.
- زر "تثبيت" في `js/pwa-install.js` بيستخدم `beforeinstallprompt` — ده
  اللي بيفتح نافذة تثبيت حقيقية (تطبيق منفصل بأيقونة خاصة)، مش اختصار.
- **حدود منصة iOS:** سفاري بيميل مفيهوش `beforeinstallprompt` API خالص —
  ده قرار من آبل نفسها، مفيش حل تقني يلتف حوله. أقصى حاجة ممكن نعملها
  (وعملناها) هي نوضح للمستخدم يدوس على زر المشاركة ثم "إضافة إلى الشاشة
  الرئيسية"، وده أيضاً بيثبت تطبيق حقيقي (standalone) طالما الـ manifest
  مضبوط، مش مجرد اختصار للمتصفح.
- لازم النشر يكون على HTTPS (شرط أساسي لعمل الـ Service Worker).

## 4) الأيقونات
- تم توليد مجموعة كاملة: favicon.ico, أيقونات 16 حتى 512px, أيقونات
  maskable لأندرويد, apple-touch-icon لـ iOS, tile لويندوز
  (browserconfig.xml). كلها في `assets/icons/`.

## 5) السيو (SEO) ومحركات البحث بالذكاء الاصطناعي
- تمت إضافة: canonical, Open Graph, Twitter Card, JSON-LD structured data
  (WebSite / SoftwareApplication / Organization), robots.txt, sitemap.xml.
- `robots.txt` بيسمح صراحة لبوتات الذكاء الاصطناعي (GPTBot, ClaudeBot,
  PerplexityBot, Google-Extended... إلخ) عشان الموقع يظهر في نتائج AI
  search/answer engines.
- `llms.txt` في الجذر بيدي وصف مختصر وموثوق للموقع لأدوات الذكاء
  الاصطناعي اللي بتدعم هذا المعيار.
- **الخطوة اللي المفروض تعملها بعد النشر:** سجّل الدومين في Google
  Search Console و Bing Webmaster Tools، وابعت `sitemap.xml` من هناك.
  السيو "100%" التقني وحده مش كفاية للتصدر — محتاج محتوى + باك لينكس +
  وقت فهرسة، وده جزء مفيش أداة تقدر تضمنه فوراً.

## 6) بعد النشر — تأكد من:
- [ ] تفعيل Google كـ auth provider
- [ ] نشر database.rules.json
- [ ] الدومين mstkhby.com شغال على HTTPS
- [ ] رفع sitemap.xml في Search Console
