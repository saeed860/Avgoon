# آوگون | AVGOON

فروشگاه مستقل و فارسی محصولات ساخت‌وساز خشک؛ رابط کاربری راست‌چین (RTL) و بدون WordPress.

## نشانی‌های فعال
- فروشگاه اصلی: https://avgoon-store.pages.dev
- پنل مدیریت: https://avgoon-store.pages.dev/admin.html
- راه‌اندازی اولین مدیر: https://avgoon-store.pages.dev/first-admin.html
- راهنمای ورود محصولات: https://avgoon-store.pages.dev/product-import-guide.html
- قالب خالی CSV: https://avgoon-store.pages.dev/product-import-template.csv
- API: https://avgoon-api.i-am-saeed4700.workers.dev

## ساختار پروژه
- `docs/`: فروشگاه استاتیک و پنل مدیریت؛ مقصد Cloudflare Pages
- `apps/worker/`: API مبتنی بر Hono و Cloudflare Workers
- `apps/worker/migrations/`: مهاجرت‌های Cloudflare D1
- `apps/api/`: پیاده‌سازی اولیه Express/Prisma برای توسعه محلی و مرجع مدل داده
- `docs/product-import-template.csv`: قالب ورود گروهی کالا؛ فقط سرستون‌ها و بدون قیمت یا موجودی ساختگی

## معماری میزبانی
- Frontend: Cloudflare Pages
- API: Cloudflare Workers
- Database: Cloudflare D1
- Email OTP: Resend؛ نیازمند Secret با نام `RESEND_API_KEY`
- شاخه انتشار اصلی: `main`

## توسعه محلی
نسخه API مستقر روی Cloudflare Workers از `apps/worker` اجرا می‌شود:
```bash
cd apps/worker
npm install
npm run typecheck
```

## قابلیت‌های فعلی
- دریافت دسته‌بندی‌ها و محصولات منتشرشده از D1، همراه جست‌وجو و فیلتر
- ورود و ثبت‌نام مشتری با کد یک‌بارمصرف ایمیلی، پس از پیکربندی Resend
- حساب مشتری و تاریخچه سفارش‌ها
- ثبت سفارش با کنترل موجودی و کلید Idempotency
- بازگردانی موجودی با لغو سفارش
- پنل مدیریت کاربران، سفارش‌ها و محصولات
- ایجاد و ویرایش محصول، انتشار/عدم انتشار و ورود گروهی CSV؛ فایل Excel در مرورگر به CSV تبدیل می‌شود
- گالری چندتصویری و مشخصات فنی محصولات
- فرم درخواست مشاوره، محدودیت ارسال و فیلد ضدربات؛ مدیریت وضعیت درخواست‌ها در پنل
- چهار دسته پایه: صفحات گچی، سازه‌های فلزی، عایق‌ها و ملزومات اجرا

## تنظیمات لازم پیش از فعال‌سازی کاربران
1. در Cloudflare Worker با نام `avgoon-api`، از مسیر Settings → Variables and Secrets، مقدار `RESEND_API_KEY` را به‌صورت Secret تنظیم کنید. مقدار کلید نباید در GitHub یا فایل‌های فرانت‌اند قرار گیرد.
2. تا زمان تأیید دامنه فرستنده در Resend، فرستنده آزمایشی `onboarding@resend.dev` فقط برای گیرندگان مجاز حساب Resend قابل استفاده است.
3. کاربر مدیر باید ابتدا با همان ایمیل ثبت‌نام و آن را تأیید کند؛ سپس راه‌اندازی مدیر اولیه با کلید محرمانه bootstrap انجام می‌شود.
4. ورود با پیامک هنوز به ارائه‌دهنده SMS متصل نشده است.
5. پیش از فروش واقعی، درگاه پرداخت، ارسال و حمل، قوانین مرجوعی و فرآیندهای مالی/مالیاتی باید تکمیل شوند.

## آزمون و انتشار
- GitHub Actions بررسی TypeScript و smoke test استقرار را اجرا می‌کند.
- smoke test سلامت API، دسته‌بندی‌ها، کاتالوگ، CORS، محافظت endpointهای مدیریت، اعتبارسنجی فرم مشاوره، صفحات فروشگاه و پنل، قالب CSV و نحو JavaScript را بررسی می‌کند.
- آزمون‌های smoke از داده ساختگی برای ایجاد سفارش یا خرید استفاده نمی‌کنند.
- انتشار Worker و Pages از شاخه `main` انجام می‌شود.

## نکات امنیتی
- Secretها فقط در تنظیمات Cloudflare نگهداری شوند.
- endpointهای مدیریت با نقش `ADMIN` محافظت شده‌اند.
- راه‌اندازی مدیر اولیه فقط یک‌بار امکان‌پذیر است.
- نمونه‌های نمایشی فروشگاه قابل سفارش نیستند و نباید با کالا، قیمت یا موجودی واقعی اشتباه گرفته شوند.
