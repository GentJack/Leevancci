# Leevancci store — go-live checklist

Static front end + 5 small Vercel functions + Supabase (database/login/photos) + Paystack (payments, ZAR).

## 1. Supabase (5 min)
1. Supabase > **SQL Editor** > New query > paste all of `supabase/schema.sql` > **Run**. Safe to run again.
   It adds the missing columns, locks down every table, creates the secure `create_order` checkout
   (prices, shipping and stock are calculated in the database), a `products` photo bucket, and seeds 10 products
   (only if your products table is empty; to start fresh first run `delete from products;`).
2. **Authentication > URL Configuration**: set Site URL to your Vercel/real domain and add `https://YOUR-DOMAIN/*` to Redirect URLs (needed for confirm-email and password-reset links).
3. Sign up on the live site, then in the SQL Editor make yourself admin:
   `update public.profiles set is_admin = true where id = (select id from auth.users where email = 'YOU@EMAIL');`
4. Change shipping any time in Table Editor > `store_settings` (defaults: free over R1 500, otherwise R99).

## 2. Keys
* `js/config.js` (public values only): `supabaseUrl`, `supabaseAnonKey` (Project Settings > API), `paystackPublicKey` (`pk_test_…`), and your business details (email, phone, WhatsApp, Instagram, address). Empty details are simply hidden.
* Vercel > Settings > Environment Variables (secret values): `PAYSTACK_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`). **Redeploy after adding them.**

## 3. Paystack
Dashboard > Settings > API Keys & Webhooks > set the webhook URL to `https://YOUR-DOMAIN/api/paystack-webhook`.
Test with `pk_test_`/`sk_test_` keys and Paystack's test cards first, then swap to live keys.
Payment methods shown (card, EFT, etc.) depend on what is enabled on your Paystack account.

## 4. Deploy
Push this folder to GitHub and import it in Vercel (no build command, no output directory), or run `vercel` in this folder.

## Test checklist before you submit
Sign up > add to cart > checkout > pay with a test card > order shows **paid** in My orders and in Admin > stock went down > try the Contact form > check `/sitemap.xml` and `/robots.txt` > share a product link in WhatsApp and check the preview.

## Notes
* **Demo mode:** with empty Supabase keys the site runs entirely in the browser (any email containing "admin" opens Admin). Never publish without the keys.
* The Privacy, Terms and Returns pages are sensible South African (POPIA/CPA) templates. Have them checked for your business and fill in `legalName`/`address` in `config.js`.
* Photos: swap/add products from **Admin > Products** (uploads are resized automatically).
