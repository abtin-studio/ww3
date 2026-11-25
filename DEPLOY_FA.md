# راهنمای کامل اجرای محلی و دپلوی آنلاین «جنگ جهانی: فرماندهی کل» 🚀

پروژه به صورت **فول‌استک یکپارچه (React + Node.js + Socket.io)** طراحی شده است؛ یعنی هم فرانت‌اند و هم سرور بلادرنگ لابی‌ها روی **یک سرویس واحد** بدون نیاز به دیتابیس خارجی اجرا می‌شوند و تمام فایل‌های کانفیگ دپلوی از قبل داخل پوشه پروژه قرار گرفته‌اند.

---

## ۱. اجرای سریع روی سیستم خودتان (تست لوکال)

```bash
npm run dev
```
سپس آدرس `http://localhost:5173` را باز کنید.

---

## ۲. بهترین روش دپلوی برای بازی در ایران بدون فیلترشکن و با پینگ فوق‌العاده (لیارا — Liara.ir)

اگر می‌خواهید دوستانتان با گوشی و اینترنت همراه اول / ایرانسل / مخابرات **بدون نیاز به روشن کردن فیلترشکن** و با سرعت لحظه‌ای وارد لابی شوند:

1. در سایت [liara.ir](https://liara.ir) وارد شوید و یک برنامه از نوع **NodeJS** بسازید.
2. در ترمینال داخل همین پوشه (`WW3`) دستور زیر را بزنید:
   ```bash
   npx @liara/cli deploy --port 3001
   ```
3. تمام! لیارا خودکار `npm run build` و `npm start` را اجرا می‌کند و یک لینک دائمی `https://your-game.liara.run` به شما می‌دهد که می‌توانید مستقیم برای دوستانتان بفرستید!

---

## ۳. دپلوی رایگان جهانی (Render.com — کاملاً رایگان با GitHub)

1. این پوشه را در یک ریپازیتوری GitHub خودتان Push کنید:
   ```bash
   git add .
   git commit -m "Initial release: WW3 Global Command"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/ww3-game.git
   git push -u origin main
   ```
2. وارد [render.com](https://render.com) شوید و روی **New +** ← **Blueprint** (یا **Web Service**) کلیک کنید و ریپازیتوری خودتان را انتخاب کنید.
3. چون فایل `render.yaml` از قبل داخل پروژه قرار داده شده است، Render همه تنظیمات (`npm install && npm run build` و `npm start`) را خودکار تشخیص می‌دهد!
4. دکمه **Deploy** را بزنید؛ ظرف ۲ دقیقه لینک آنلاین سایت (`https://ww3-global-command.onrender.com`) آماده است!

---

## ۴. دپلوی یک‌کلیکی روی Railway یا هر سرور VPS (با Docker)

* **Railway.app:** کافیست ریپازیتوری GitHub را به Railway وصل کنید؛ فایل `railway.json` همه‌چیز را خودکار بالا می‌آورد.
* **Docker روی هر سرور مجازی (VPS):**
  ```bash
  docker build -t ww3-command .
  docker run -d -p 3001:3001 --restart always ww3-command
  ```
