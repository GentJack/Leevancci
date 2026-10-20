/* ============================================================================
   LEEVANCCI — SITE SETTINGS
   This is the only file you need to edit to go live.
   (Everything here is safe to be public. Secret keys go in Vercel, never here.)
   ========================================================================== */
window.LV_CONFIG = {

  /* 1. SUPABASE  — Project Settings > API
        Paste the Project URL and the "anon / public" key.
        Leave both empty to run in DEMO mode (data is saved in the browser only). */
  supabaseUrl: "https://eqyriouxhgaacuzptsin.supabase.co",
  supabaseAnonKey: "sb_publishable_QhVB3YDhAk3clyAEDP-olg_7wLQyM5h",

  /* 2. PAYSTACK — Dashboard > Settings > API Keys & Webhooks
        Paste the PUBLIC key (pk_test_... while testing, pk_live_... when live).
        The SECRET key goes in Vercel as PAYSTACK_SECRET_KEY, not here. */
  paystackPublicKey: "pk_test_b9b15024b4014484c52295c2342f2657f662c775",

  /* 3. SHIPPING — used until the database values load (the database wins; see store_settings table) */
  freeShippingCents: 150000,   // free delivery from R1 500
  shippingCents: 9900,         // otherwise R99

  /* 4. BUSINESS DETAILS — shown on Contact, Privacy, Terms and in the footer.
        Fill in what you have; anything left empty is simply hidden. */
  business: {
    name: "Leevancci",
    legalName: "",            // e.g. "Leevancci (Pty) Ltd"
    email: "",                // e.g. "Info@Leevancci.co.za"
    phone: "",                // e.g. "+27 76 631 4762"
    whatsapp: "",             // digits only with country code, e.g. "27820000000"
    instagram: "",            // full URL, e.g. "https://instagram.com/leevancci"
    address: "",              // trading / return address
    hours: "Mon–Fri, 9:00–17:00 (SAST)"
  }
};
