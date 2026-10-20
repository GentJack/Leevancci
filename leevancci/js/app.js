/* ============================================================================
   LEEVANCCI storefront — single-page app (no build step).
   Works in two modes:
     DEMO  (no Supabase keys in js/config.js): everything is saved in the browser
     LIVE  (keys present): Supabase for data/auth, Paystack for payment
   ========================================================================== */
(function () {
  'use strict';

  var C = window.LV_CONFIG || {};
  var B = C.business || {};
  var BRAND = B.name || 'Leevancci';
  var LIVE = !!(C.supabaseUrl && C.supabaseAnonKey);
  var sb = null;
  var SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  var PAYSTACK_JS = 'https://js.paystack.co/v1/inline.js';
  var PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'];
  var STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'];

  /* ---------- tiny helpers ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var money = function (c) { var n = (c || 0) / 100; return 'R' + n.toFixed(n % 1 ? 2 : 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
  var LS = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } }
  };
  var img = function (n) { n = n || 'hero.webp'; return /^(https?:|data:|\/)/.test(n) ? n : '/images/' + n; };
  var date = function (d) { try { return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } };
  var slugify = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  var emailOk = function (e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); };
  var errText = function (e) { return (e && (e.message || e.error_description)) || 'Something went wrong. Please try again.'; };
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[src="' + src + '"]')) return res();
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = res; s.onerror = function () { rej(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }
  function setBusy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.l = btn.textContent; btn.disabled = true; if (label) btn.textContent = label; }
    else { btn.disabled = false; if (btn.dataset.l) btn.textContent = btn.dataset.l; }
  }
  var contactLine = function () {
    return B.email ? '<a href="mailto:' + esc(B.email) + '">' + esc(B.email) + '</a>' : 'our <a href="/contact">contact page</a>';
  };

  /* ---------- state ---------- */
  var S = {
    user: null,
    cart: LS.get('lv_cart', []),
    products: null,
    settings: { free: C.freeShippingCents || 150000, ship: C.shippingCents || 9900 },
    next: null,
    sel: { size: '', qty: 1 },
    tab: 'orders',
    edit: null
  };

  /* ---------- demo seed (mirrors supabase/schema.sql) ---------- */
  var SEED = [
    ['Crystal-Studded Sneakers', 189900, 'Low-top black sneakers hand-set with crystals across the quarter, with the Leevancci wordmark on the side. Statement shoes that still go with everything.', 'sneakers.webp', [], 'Shoes', ['36', '37', '38', '39', '40', '41', '42', '43'], 12],
    ['Noir Cap-Toe Oxford', 249900, 'A classic cap-toe oxford in deep oxblood leather with a polished finish and the Leevancci wordmark. Tailoring-ready.', 'oxford.webp', [], 'Shoes', ['40', '41', '42', '43', '44', '45'], 8],
    ['Emerald Platform Slides', 64900, 'Moulded platform slides in emerald green with a tonal embossed logo. Soft footbed, easy all day.', 'slides.webp', [], 'Shoes', ['36', '37', '38', '39', '40', '41'], 20],
    ['Emerald Chain Shoulder Bag', 74900, 'Structured shoulder bag in deep emerald with a gold-tone chain detail, tonal debossed logo and a magnetic flap.', 'shoulder-bag.webp', [], 'Bags', [], 10],
    ['Noir Crossbody Bag', 54900, 'A compact black crossbody with a fold-over flap, gold foil logo and an adjustable strap. Fits phone, cards and keys.', 'crossbody.webp', [], 'Bags', [], 15],
    ['Heritage Quilted Weekender', 249900, 'Quilted weekender in navy, red and gold stripes with leather handles and a detachable strap. Room for a weekend away.', 'weekender.webp', [], 'Bags', [], 5],
    ['Heritage Gold Watch', 129900, 'Gold-tone bracelet watch with a champagne dial, crystal hour markers and a date window. Heritage Gold Edition.', 'watch.webp', [], 'Accessories', [], 7],
    ['Signature Long Sleeve Tee', 69900, 'Heavyweight black long sleeve with a chest pocket and the Leevancci wordmark. Relaxed fit, built for training and the street.', 'long-sleeve.webp', [], 'Apparel', ['S', 'M', 'L', 'XL', 'XXL'], 25],
    ['Performance Crop & Tights Set', 69900, 'High-rise black tights with a wide logo waistband, paired with a square-neck crop top. Soft, stretchy and supportive.', 'tights-set.webp', [], 'Apparel', ['XS', 'S', 'M', 'L', 'XL'], 18],
    ['Signature Bralette & Brief Set', 59900, 'Moulded bralette and high-cut brief in black with the Leevancci logo band. Smooth under clothes, comfortable all day.', 'bralette-set.webp', ['bralette-set-2.webp'], 'Intimates', ['XS', 'S', 'M', 'L', 'XL'], 30]
  ].map(function (p, i) {
    return { id: i + 1, name: p[0], slug: slugify(p[0]), price_cents: p[1], description: p[2], image: p[3], gallery: p[4], category: p[5], sizes: p[6], stock: p[7], is_active: true, sort: (i + 1) * 10 };
  });

  /* ==========================================================================
     DATA LAYER — one function per thing the UI needs; demo and live branches
     ========================================================================== */
  var D = {
    settings: async function () {
      if (!LIVE) return;
      var r = await sb.from('store_settings').select('*').eq('id', 1).maybeSingle();
      if (r.data) S.settings = { free: r.data.free_shipping_threshold_cents, ship: r.data.shipping_cents };
    },
    products: async function (force) {
      if (S.products && !force) return S.products;
      var list;
      if (!LIVE) list = LS.get('lv_products', SEED);
      else {
        var r = await sb.from('products').select('*').order('sort', { ascending: true }).order('id', { ascending: true });
        if (r.error) throw r.error;
        list = r.data || [];
      }
      S.products = list.filter(function (p) { return p.is_active !== false; }).map(function (p) { p.sizes = p.sizes || []; p.gallery = p.gallery || []; return p; });
      return S.products;
    },
    allProducts: async function () { // admin: includes inactive
      if (!LIVE) return LS.get('lv_products', SEED);
      var r = await sb.from('products').select('*').order('sort', { ascending: true }).order('id', { ascending: true });
      if (r.error) throw r.error; return r.data || [];
    },
    user: async function () {
      if (!LIVE) { var u = LS.get('lv_user', null); return u ? { id: u.email, email: u.email, name: u.name || '', admin: /admin/i.test(u.email) } : null; }
      var s = (await sb.auth.getSession()).data.session; if (!s) return null;
      var p = await sb.from('profiles').select('is_admin,full_name').eq('id', s.user.id).maybeSingle();
      return { id: s.user.id, email: s.user.email, name: (p.data && p.data.full_name) || '', admin: !!(p.data && p.data.is_admin) };
    },
    signup: async function (n, e, p) {
      if (!LIVE) { LS.set('lv_user', { email: e, name: n }); return {}; }
      var r = await sb.auth.signUp({ email: e, password: p, options: { data: { full_name: n }, emailRedirectTo: location.origin + '/login' } });
      return { error: r.error, msg: !r.error && !r.data.session ? 'Almost there. Check your email and confirm your address, then log in.' : '' };
    },
    login: async function (e, p) {
      if (!LIVE) { LS.set('lv_user', { email: e }); return {}; }
      return { error: (await sb.auth.signInWithPassword({ email: e, password: p })).error };
    },
    logout: async function () { if (!LIVE) LS.set('lv_user', null); else await sb.auth.signOut(); },
    forgot: async function (e) {
      if (!LIVE) return {};
      return { error: (await sb.auth.resetPasswordForEmail(e, { redirectTo: location.origin + '/reset' })).error };
    },
    newPassword: async function (p) {
      if (!LIVE) return {};
      return { error: (await sb.auth.updateUser({ password: p })).error };
    },
    uploadImage: async function (file) {
      var blob = await resizeImage(file, LIVE ? 1400 : 700, LIVE ? 'image/webp' : 'image/jpeg');
      if (!LIVE) return await new Promise(function (res) { var f = new FileReader(); f.onload = function () { res(f.result); }; f.readAsDataURL(blob); });
      var ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      var path = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7) + '.' + ext;
      var r = await sb.storage.from('products').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
      if (r.error) throw r.error;
      return sb.storage.from('products').getPublicUrl(path).data.publicUrl;
    },
    saveProduct: async function (row, id) {
      if (!LIVE) {
        var a = LS.get('lv_products', SEED);
        if (id) a = a.map(function (p) { return p.id == id ? Object.assign({}, p, row) : p; });
        else { row.id = Date.now(); row.is_active = true; a.push(row); }
        LS.set('lv_products', a); return {};
      }
      if (id) return { error: (await sb.from('products').update(row).eq('id', id)).error };
      row.sort = 200;
      return { error: (await sb.from('products').insert(row)).error };
    },
    delProduct: async function (id) {
      if (!LIVE) { LS.set('lv_products', LS.get('lv_products', SEED).filter(function (p) { return p.id != id; })); return {}; }
      var r = await sb.from('products').delete().eq('id', id);
      // products that already appear on orders can't be deleted; hide them instead
      if (r.error) r = await sb.from('products').update({ is_active: false }).eq('id', id);
      return { error: r.error };
    },
    order: async function (addr) {
      var items = S.cart.map(function (i) { return { id: i.id, size: i.size || '', qty: i.qty }; });
      if (!LIVE) {
        var ps = await D.products(), sub = 0;
        for (var k = 0; k < S.cart.length; k++) {
          var c = S.cart[k], p = ps.filter(function (x) { return x.id == c.id; })[0];
          if (!p) return { error: { message: 'An item in your cart is no longer available.' } };
          sub += p.price_cents * c.qty;
        }
        var ship = sub >= S.settings.free ? 0 : S.settings.ship, os = LS.get('lv_orders', []);
        var o = {
          id: 1001 + os.length, reference: 'LV-' + Math.random().toString(36).slice(2, 10).toUpperCase(), status: 'pending',
          subtotal_cents: sub, shipping_cents: ship, total_cents: sub + ship, shipping_address: addr, customer_email: S.user.email,
          created_at: new Date().toISOString(),
          order_items: S.cart.map(function (c) { return { product_name: c.name, unit_price_cents: c.price_cents, quantity: c.qty, size: c.size }; })
        };
        os.push(o); LS.set('lv_orders', os);
        return { order: { id: o.id, reference: o.reference, total_cents: o.total_cents, email: o.customer_email } };
      }
      var r = await sb.rpc('create_order', { p_items: items, p_address: addr });
      return r.error ? { error: r.error } : { order: r.data };
    },
    renew: async function (id) {
      if (!LIVE) { var o = LS.get('lv_orders', []).filter(function (x) { return x.id == id; })[0]; return { order: { id: o.id, reference: o.reference, total_cents: o.total_cents, email: o.customer_email } }; }
      var r = await sb.rpc('renew_order_reference', { p_order: id });
      return r.error ? { error: r.error } : { order: r.data };
    },
    orders: async function (all) {
      if (!LIVE) {
        var os = LS.get('lv_orders', []).slice().reverse();
        return all ? os : os.filter(function (o) { return o.customer_email === S.user.email; });
      }
      var q = sb.from('orders').select('*, order_items(*)').order('id', { ascending: false });
      if (!all) q = q.eq('user_id', S.user.id);
      var r = await q; if (r.error) throw r.error; return r.data || [];
    },
    orderByRef: async function (ref) {
      var os = await D.orders(false);
      return os.filter(function (o) { return o.reference === ref; })[0] || null;
    },
    setStatus: async function (id, s) {
      if (!LIVE) { var o = LS.get('lv_orders', []); o.forEach(function (x) { if (x.id == id) x.status = s; }); LS.set('lv_orders', o); return {}; }
      return { error: (await sb.from('orders').update({ status: s }).eq('id', id)).error };
    },
    demoPaid: function (ref) {
      var o = LS.get('lv_orders', []); o.forEach(function (x) { if (x.reference === ref && x.status === 'pending') { x.status = 'paid'; x.paid_at = new Date().toISOString(); } }); LS.set('lv_orders', o);
    },
    verify: async function (ref) {
      var r = await fetch('/api/paystack-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: ref }) });
      var j = {}; try { j = await r.json(); } catch (e) { /* not JSON */ }
      return { ok: !!j.ok, error: j.error };
    },
    subscribe: async function (email) {
      if (!LIVE) { var s = LS.get('lv_subs', []); if (s.indexOf(email) < 0) s.push(email); LS.set('lv_subs', s); return {}; }
      var r = await sb.from('newsletter_subscribers').insert({ email: email });
      return { error: r.error && r.error.code !== '23505' ? r.error : null };
    },
    contact: async function (row) {
      if (!LIVE) { var m = LS.get('lv_msgs', []); row.created_at = new Date().toISOString(); m.push(row); LS.set('lv_msgs', m); return {}; }
      return { error: (await sb.from('contact_messages').insert(row)).error };
    },
    messages: async function () {
      if (!LIVE) return LS.get('lv_msgs', []).slice().reverse();
      var r = await sb.from('contact_messages').select('*').order('id', { ascending: false }).limit(100); return r.data || [];
    },
    subscribers: async function () {
      if (!LIVE) return LS.get('lv_subs', []);
      var r = await sb.from('newsletter_subscribers').select('email').order('id', { ascending: false }); return (r.data || []).map(function (x) { return x.email; });
    }
  };

  function resizeImage(file, max, type) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('Could not process that image.')); }, type, 0.86);
      };
      im.onerror = function () { rej(new Error('That file is not a usable image.')); };
      im.src = url;
    });
  }

  /* ==========================================================================
     CART
     ========================================================================== */
  var cartKey = function (i) { return i.id + '|' + (i.size || ''); };
  var cartSub = function () { return S.cart.reduce(function (s, i) { return s + i.price_cents * i.qty; }, 0); };
  var cartCount = function () { return S.cart.reduce(function (s, i) { return s + i.qty; }, 0); };
  var shipFor = function (sub) { return sub >= S.settings.free ? 0 : S.settings.ship; };

  function syncCart() { // refresh snapshots from the live catalogue
    if (!S.products) return;
    S.cart = S.cart.filter(function (i) {
      var p = S.products.filter(function (x) { return x.id == i.id; })[0];
      if (!p) return false;
      i.name = p.name; i.price_cents = p.price_cents; i.image = p.image; i.slug = p.slug;
      if (p.stock != null) { if (p.stock < 1) return false; i.qty = Math.min(i.qty, p.stock); }
      return true;
    });
    drawCart();
  }
  function addToCart(p, size, qty) {
    var line = S.cart.filter(function (i) { return i.id == p.id && (i.size || '') === (size || ''); })[0];
    var have = line ? line.qty : 0, cap = p.stock != null ? Math.min(10, p.stock) : 10;
    if (have + qty > cap) { toast(cap <= have ? 'You already have the maximum available in your cart.' : 'Only ' + cap + ' available.'); qty = cap - have; if (qty < 1) return false; }
    if (line) line.qty += qty;
    else S.cart.push({ id: p.id, name: p.name, price_cents: p.price_cents, image: p.image, slug: p.slug, size: size || '', qty: qty });
    drawCart(); return true;
  }
  function drawCart() {
    var sub = cartSub();
    $('items').innerHTML = S.cart.map(function (i) {
      return '<div class="ci"><a href="/product/' + esc(i.slug) + '"><img src="' + esc(img(i.image)) + '" alt="" width="72" height="72"></a><div><a class="t" href="/product/' + esc(i.slug) + '">' + esc(i.name) + '</a>' +
        (i.size ? '<div class="mut small">Size ' + esc(i.size) + '</div>' : '') +
        '<div class="qty"><button data-a="dec" data-k="' + esc(cartKey(i)) + '" aria-label="Decrease quantity">−</button><span>' + i.qty + '</span><button data-a="inc" data-k="' + esc(cartKey(i)) + '" aria-label="Increase quantity">+</button></div>' +
        '<button class="rm" data-a="rm" data-k="' + esc(cartKey(i)) + '">Remove</button></div><div>' + money(i.price_cents * i.qty) + '</div></div>';
    }).join('') || '<p class="mut" style="padding:40px 0;text-align:center">Your cart is empty.<br><a class="lnk" style="margin-top:14px" href="/shop" data-a="close">Start shopping</a></p>';
    $('tot').textContent = money(sub);
    $('cart-count').textContent = cartCount();
    $('co-btn').disabled = !S.cart.length;
    var left = S.settings.free - sub;
    $('ship-note').innerHTML = !S.cart.length ? 'Free delivery on orders over ' + money(S.settings.free) :
      left > 0 ? 'You are <strong>' + money(left) + '</strong> away from free delivery<div class="meter"><i style="width:' + Math.min(100, Math.round(sub / S.settings.free * 100)) + '%"></i></div>' :
        'You have unlocked <strong>free delivery</strong>';
    LS.set('lv_cart', S.cart);
  }
  var lastFocus = null;
  function openCart() {
    lastFocus = document.activeElement;
    var c = $('cart'), s = $('scrim'); s.hidden = false; requestAnimationFrame(function () { s.classList.add('on'); });
    c.classList.add('open'); c.setAttribute('aria-hidden', 'false'); $('shell').inert = true;
    c.querySelector('.x').focus();
  }
  function closeCart() {
    var c = $('cart'), s = $('scrim'); if (!c.classList.contains('open')) return;
    c.classList.remove('open'); c.setAttribute('aria-hidden', 'true'); s.classList.remove('on'); $('shell').inert = false;
    setTimeout(function () { s.hidden = true; }, 250);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ==========================================================================
     META / SEO
     ========================================================================== */
  function setMeta(title, desc, o) {
    o = o || {};
    var full = title ? title + ' | ' + BRAND : BRAND + ' | Performance Luxury';
    document.title = full;
    var set = function (sel, attr, val) { var e = document.querySelector(sel); if (e) e.setAttribute(attr, val); };
    desc = desc || 'Performance luxury shoes, bags, apparel and accessories. Secure checkout in rand with Paystack.';
    set('meta[name=description]', 'content', desc);
    set('meta[property="og:title"]', 'content', full);
    set('meta[property="og:description"]', 'content', desc);
    set('meta[property="og:image"]', 'content', location.origin + (o.img || '/images/og.jpg'));
    set('link[rel=canonical]', 'href', location.origin + location.pathname);
    var rb = document.querySelector('meta[name=robots]');
    if (o.noindex) { if (!rb) { rb = document.createElement('meta'); rb.name = 'robots'; document.head.appendChild(rb); } rb.content = 'noindex,nofollow'; }
    else if (rb) rb.remove();
    var ld = $('ld'); if (ld) ld.remove();
    if (o.ld) { ld = document.createElement('script'); ld.id = 'ld'; ld.type = 'application/ld+json'; ld.textContent = JSON.stringify(o.ld); document.head.appendChild(ld); }
  }

  /* ==========================================================================
     SHARED PIECES
     ========================================================================== */
  function nlForm(id) {
    return '<form class="nl" data-f="nl" novalidate><label class="hp" for="' + id + '">Email</label>' +
      '<input id="' + id + '" name="e" type="email" placeholder="Your email address" autocomplete="email" required aria-label="Email address"><button>Subscribe</button></form><p class="small mut nl-msg" role="status"></p>';
  }
  function card(p) {
    var sold = p.stock != null && p.stock < 1;
    return '<article class="card' + (sold ? ' sold' : '') + '"><a href="/product/' + esc(p.slug) + '" aria-label="' + esc(p.name) + '"><div class="img"><img src="' + esc(img(p.image)) + '" alt="' + esc(p.name) + '" loading="lazy" width="600" height="600">' +
      (sold ? '<span class="tag">Sold out</span>' : (p.stock != null && p.stock <= 3 ? '<span class="tag">Low stock</span>' : '')) + '</div>' +
      '<h3>' + esc(p.name) + '</h3><span class="price">' + money(p.price_cents) + '</span></a></article>';
  }
  function cats() {
    var seen = {}, out = [];
    (S.products || []).forEach(function (p) { if (p.category && !seen[p.category]) { seen[p.category] = 1; out.push(p.category); } });
    return out;
  }
  function renderHeader() {
    var u = S.user;
    $('acct').innerHTML = u ? (u.admin ? '<a href="/admin">Admin</a>' : '') + '<a href="/account">Account</a><button data-a="out">Logout</button>' : '<a href="/login">Login</a>';
    var path = location.pathname;
    Array.prototype.forEach.call(document.querySelectorAll('#nav a'), function (a) {
      var h = a.getAttribute('href').split('?')[0];
      if (h === path && !a.getAttribute('href').includes('?')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('bar').textContent = LIVE ? 'Free delivery on orders over ' + money(S.settings.free) + ' · Secure payments by Paystack' : 'DEMO MODE: data stays in this browser. Add your Supabase keys in js/config.js to go live.';
  }
  function renderFooter() {
    var links = [];
    if (B.email) links.push('<li><a href="mailto:' + esc(B.email) + '">' + esc(B.email) + '</a></li>');
    if (B.phone) links.push('<li><a href="tel:' + esc(B.phone.replace(/\s/g, '')) + '">' + esc(B.phone) + '</a></li>');
    if (B.whatsapp) links.push('<li><a href="https://wa.me/' + esc(B.whatsapp) + '" target="_blank" rel="noopener">WhatsApp</a></li>');
    if (B.instagram) links.push('<li><a href="' + esc(B.instagram) + '" target="_blank" rel="noopener">Instagram</a></li>');
    $('foot').innerHTML = '<div class="foot-g"><div><a class="logo" href="/">' + esc(BRAND) + '</a><p class="mut">Performance luxury for the way you move.</p><ul>' + links.join('') + '</ul></div>' +
      '<div><h4>Shop</h4><ul><li><a href="/shop">All products</a></li>' + cats().map(function (c) { return '<li><a href="/shop?cat=' + encodeURIComponent(c) + '">' + esc(c) + '</a></li>'; }).join('') + '</ul></div>' +
      '<div><h4>Help</h4><ul><li><a href="/contact">Contact us</a></li><li><a href="/shipping-returns">Shipping &amp; returns</a></li><li><a href="/account">My orders</a></li><li><a href="/about">About</a></li><li><a href="/privacy">Privacy policy</a></li><li><a href="/terms">Terms of sale</a></li></ul></div>' +
      '<div><h4>Stay in the loop</h4><p class="mut small">New drops and early access. No spam.</p>' + nlForm('nl-f') + '</div></div>' +
      '<div class="foot-b"><span>© ' + new Date().getFullYear() + ' ' + esc(B.legalName || BRAND) + '. All rights reserved.</span><span>Prices in South African Rand (ZAR) · Payments secured by Paystack</span></div>';
  }

  /* ==========================================================================
     VIEWS
     ========================================================================== */
  var V = {};

  V.home = async function () {
    var ps = await D.products();
    setMeta('', 'Performance luxury shoes, bags, apparel and accessories from ' + BRAND + '. Delivered across South Africa, secure checkout in rand.');
    var cs = cats().slice(0, 4);
    $('app').innerHTML =
      '<section class="hero"><div class="hero-t"><span class="eyebrow">The Autumn Collection</span><h1>Performance, <br>refined.</h1>' +
      '<p>Shoes, bags and apparel designed for people who train hard and dress sharper. Delivered nationwide.</p>' +
      '<div class="cta"><a class="btn" href="/shop">Shop the collection</a><a class="btn btn-o" href="/about">Our story</a></div></div>' +
      '<div class="hero-i"><img src="/images/hero.webp" alt="Model in a black Leevancci polo and gold watch, standing beside the Leevancci sign" width="1000" height="1502" fetchpriority="high"></div></section>' +
      '<div class="perks"><div><strong>Free delivery</strong><span>On orders over ' + money(S.settings.free) + '</span></div><div><strong>7-day returns</strong><span>Easy, no-fuss exchanges</span></div><div><strong>Secure checkout</strong><span>Secured by Paystack</span></div><div><strong>Nationwide</strong><span>Delivered across South Africa</span></div></div>' +
      (cs.length ? '<section class="wrap sec"><div class="sec-h"><h2>Shop by category</h2></div><div class="tiles">' + cs.map(function (c) {
        var p = ps.filter(function (x) { return x.category === c; })[0];
        return '<a class="tile" href="/shop?cat=' + encodeURIComponent(c) + '"><img src="' + esc(img(p.image)) + '" alt="" loading="lazy" width="500" height="667" style="object-position:center 25%"><span>' + esc(c) + '</span></a>';
      }).join('') + '</div></section>' : '') +
      '<section class="wrap sec"><div class="sec-h"><h2>New arrivals</h2><a class="lnk" href="/shop">View all</a></div>' +
      (ps.length ? '<div class="grid">' + ps.slice(0, 8).map(card).join('') + '</div>' : '<p class="empty">New pieces arriving soon.</p>') + '</section>' +
      '<section class="band"><h2>Join the list</h2><p class="mut">Be first to hear about new drops and restocks.</p>' + nlForm('nl-h') + '</section>';
  };

  V.shop = async function () {
    var ps = await D.products(), q = new URLSearchParams(location.search);
    S.shop = { cat: q.get('cat') || '', q: q.get('q') || '', sort: q.get('sort') || '' };
    var c = S.shop.cat;
    setMeta(c || 'Shop', (c ? c + ' from ' : 'Shop all ') + BRAND + '. Performance luxury shoes, bags, apparel and accessories.');
    $('app').innerHTML = '<div class="page-h"><h1>' + esc(c || 'Shop all') + '</h1></div><div class="wrap"><div class="bar-f"><div class="chips" role="group" aria-label="Filter by category"></div>' +
      '<div class="tools"><label class="hp" for="q">Search</label><input id="q" type="search" placeholder="Search products" value="' + esc(S.shop.q) + '" autocomplete="off">' +
      '<label class="hp" for="sort">Sort</label><select id="sort"><option value="">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="name">Name A–Z</option></select></div></div>' +
      '<div id="pgrid" aria-live="polite"></div></div>';
    $('sort').value = S.shop.sort;
    shopDraw();
  };
  function shopDraw() {
    var f = S.shop, ps = (S.products || []).filter(function (p) {
      return (!f.cat || p.category === f.cat) && (!f.q || (p.name + ' ' + (p.description || '') + ' ' + (p.category || '')).toLowerCase().indexOf(f.q.toLowerCase()) >= 0);
    });
    if (f.sort === 'low') ps.sort(function (a, b) { return a.price_cents - b.price_cents; });
    else if (f.sort === 'high') ps.sort(function (a, b) { return b.price_cents - a.price_cents; });
    else if (f.sort === 'name') ps.sort(function (a, b) { return a.name.localeCompare(b.name); });
    var chips = [''].concat(cats());
    document.querySelector('.chips').innerHTML = chips.map(function (c) { return '<button class="chip" data-a="cat" data-c="' + esc(c) + '" aria-pressed="' + (f.cat === c) + '">' + esc(c || 'All') + '</button>'; }).join('');
    $('pgrid').innerHTML = ps.length ? '<div class="grid">' + ps.map(card).join('') + '</div>' : '<p class="empty">No products match your search.<br><button class="lnk" data-a="clear" style="margin-top:14px">Clear filters</button></p>';
    var qs = new URLSearchParams(); if (f.cat) qs.set('cat', f.cat); if (f.q) qs.set('q', f.q); if (f.sort) qs.set('sort', f.sort);
    history.replaceState(null, '', location.pathname + (qs.toString() ? '?' + qs : ''));
    $('app').querySelector('h1').textContent = f.cat || 'Shop all';
  }

  V.product = async function (slug) {
    var ps = await D.products(), p = ps.filter(function (x) { return x.slug === slug; })[0];
    if (!p) return V.notfound();
    S.sel = { size: '', qty: 1 };
    var imgs = [p.image].concat(p.gallery || []).filter(Boolean), sold = p.stock != null && p.stock < 1;
    var rel = ps.filter(function (x) { return x.id !== p.id && x.category === p.category; }).concat(ps.filter(function (x) { return x.id !== p.id && x.category !== p.category; })).slice(0, 4);
    setMeta(p.name, (p.description || '').slice(0, 155), {
      img: /^https?:/.test(imgs[0] || '') ? undefined : '/images/' + imgs[0],
      ld: { '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.description, image: imgs.map(function (i) { return /^https?:/.test(i) ? i : location.origin + '/images/' + i; }), brand: { '@type': 'Brand', name: BRAND }, category: p.category,
        offers: { '@type': 'Offer', priceCurrency: 'ZAR', price: (p.price_cents / 100).toFixed(2), availability: 'https://schema.org/' + (sold ? 'OutOfStock' : 'InStock'), url: location.origin + '/product/' + p.slug } }
    });
    $('app').innerHTML = '<div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/shop">Shop</a>' + (p.category ? ' / <a href="/shop?cat=' + encodeURIComponent(p.category) + '">' + esc(p.category) + '</a>' : '') + '</nav>' +
      '<div class="pdp"><div class="gal"><div class="gal-main"><img id="gm" src="' + esc(img(imgs[0])) + '" alt="' + esc(p.name) + '" fetchpriority="high"></div>' +
      (imgs.length > 1 ? '<div class="thumbs">' + imgs.map(function (i, k) { return '<button data-a="thumb" data-i="' + esc(img(i)) + '" aria-label="View image ' + (k + 1) + '" aria-current="' + (k === 0) + '"><img src="' + esc(img(i)) + '" alt=""></button>'; }).join('') + '</div>' : '') + '</div>' +
      '<div class="info"><h1>' + esc(p.name) + '</h1><div class="price">' + money(p.price_cents) + '</div><p class="mut">' + esc(p.description || '') + '</p>' +
      (p.sizes.length ? '<fieldset class="sizes"><legend><span>Select size</span></legend>' + p.sizes.map(function (s, k) { return '<input type="radio" name="size" id="s' + k + '" value="' + esc(s) + '"' + (sold ? ' disabled' : '') + '><label for="s' + k + '">' + esc(s) + '</label>'; }).join('') + '</fieldset>' : '') +
      '<div class="stock">' + (sold ? '<span class="low">Sold out</span>' : (p.stock != null && p.stock <= 3 ? '<span class="low">Only ' + p.stock + ' left</span>' : '<span class="ok">In stock</span>')) + '</div>' +
      '<div class="buy"><div class="qty"><button data-a="q-" aria-label="Decrease quantity">−</button><span id="qv" aria-live="polite">1</span><button data-a="q+" aria-label="Increase quantity">+</button></div>' +
      '<button class="btn" data-a="buy" data-id="' + p.id + '"' + (sold ? ' disabled' : '') + '>' + (sold ? 'Sold out' : 'Add to cart') + '</button></div><p id="buy-err" class="err" role="alert"></p>' +
      '<details open><summary>Delivery</summary><p>Delivered nationwide. Free over ' + money(S.settings.free) + ', otherwise ' + money(S.settings.ship) + ' flat rate. Most orders arrive in 3–7 working days.</p></details>' +
      '<details><summary>Returns</summary><p>Not right? Return unworn items within 7 days of delivery. <a href="/shipping-returns" style="text-decoration:underline">Read the full policy</a>.</p></details>' +
      '<details><summary>Secure payment</summary><p>Pay through Paystack using the payment options shown at checkout. We never see or store your card details.</p></details></div></div>' +
      (rel.length ? '<section class="sec"><div class="sec-h"><h2>You may also like</h2></div><div class="grid">' + rel.map(card).join('') + '</div></section>' : '') + '</div>';
  };

  V.checkout = async function () {
    if (!S.user) { S.next = '/checkout'; toast('Please log in or create an account to check out.'); return nav('/login', true); }
    await D.products(); syncCart();
    setMeta('Checkout', '', { noindex: true });
    if (!S.cart.length) { $('app').innerHTML = '<section class="box"><h1>Checkout</h1><p style="text-align:center" class="mut">Your cart is empty.</p><p style="text-align:center"><a class="btn" href="/shop">Continue shopping</a></p></section>'; return; }
    var sub = cartSub(), ship = shipFor(sub), a = LS.get('lv_addr', {});
    var f = function (n, label, extra) { return '<div><label for="' + n + '">' + label + '</label><input id="' + n + '" name="' + n + '" value="' + esc(a[n] || '') + '" ' + (extra || '') + '></div>'; };
    $('app').innerHTML = '<div class="page-h"><h1>Checkout</h1></div><div class="wrap"><div class="co-g"><form id="ship" novalidate><h3 style="margin-bottom:16px">Delivery details</h3>' +
      '<p class="mut small">Delivering within South Africa. Order updates go to <strong>' + esc(S.user.email) + '</strong>.</p>' +
      f('name', 'Full name', 'autocomplete="name" required') + f('phone', 'Phone (for the courier)', 'type="tel" autocomplete="tel" required') +
      f('line1', 'Street address', 'autocomplete="address-line1" required') + f('suburb', 'Suburb', 'autocomplete="address-level3"') +
      '<div class="two">' + f('city', 'City / town', 'autocomplete="address-level2" required') + f('postal_code', 'Postal code', 'inputmode="numeric" maxlength="4" pattern="[0-9]{4}" autocomplete="postal-code" required') + '</div>' +
      '<label for="province">Province</label><select id="province" name="province" required autocomplete="address-level1"><option value="">Select province</option>' + PROVINCES.map(function (x) { return '<option' + (a.province === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>' +
      '<p id="msg" class="err" role="alert"></p><button class="btn btn-block" id="pay-btn">Pay ' + money(sub + ship) + ' securely</button>' +
      '<p class="secure">Secure payment by Paystack. Pay by card or the other options Paystack offers.' + (LIVE ? '' : '<br><strong>Demo mode:</strong> no real payment is taken.') + '</p></form>' +
      '<aside class="sum"><h3 style="margin-bottom:8px">Order summary</h3>' + S.cart.map(function (i) {
        return '<div class="row"><span style="display:flex;gap:12px;align-items:center"><img class="thumb-s" src="' + esc(img(i.image)) + '" alt="" width="56" height="56"><span>' + esc(i.name) + '<br><span class="mut small">' + (i.size ? 'Size ' + esc(i.size) + ' · ' : '') + 'Qty ' + i.qty + '</span></span></span><span>' + money(i.price_cents * i.qty) + '</span></div>';
      }).join('') + '<div class="row"><span>Subtotal</span><span>' + money(sub) + '</span></div><div class="row"><span>Delivery</span><span>' + (ship ? money(ship) : 'Free') + '</span></div><div class="row"><strong>Total</strong><strong>' + money(sub + ship) + '</strong></div></aside></div></div>';
  };

  V.order = async function (ref) {
    if (!S.user) { S.next = location.pathname; return nav('/login', true); }
    setMeta('Order confirmation', '', { noindex: true });
    var o = await D.orderByRef(ref);
    if (!o) { $('app').innerHTML = '<section class="box"><h1>Order not found</h1><p class="mut" style="text-align:center">We could not find that order on your account.</p><p style="text-align:center"><a class="btn" href="/account">My orders</a></p></section>'; return; }
    var paid = o.status !== 'pending', a = o.shipping_address || {};
    $('app').innerHTML = '<section class="box wide" style="max-width:640px"><span class="eyebrow" style="text-align:center">Order ' + esc(o.reference) + '</span><h1>' + (paid ? 'Thank you, ' + esc((a.name || '').split(' ')[0] || 'friend') + '.' : 'Payment pending') + '</h1>' +
      (paid ? '<p style="text-align:center" class="mut">Your order is confirmed and we are getting it ready. Paystack will email you a receipt, and you can follow progress under <a href="/account" style="text-decoration:underline">My orders</a>.</p>' :
        '<div class="paybox"><p><strong>We have not received confirmation of payment yet.</strong></p><p>If you have just paid, this can take a minute. If you were charged and this does not update, contact us with reference <strong>' + esc(o.reference) + '</strong>.</p><button class="btn" data-a="recheck" data-ref="' + esc(o.reference) + '">Check payment again</button> <button class="btn btn-o" data-a="payorder" data-id="' + o.id + '">Pay now</button><p id="msg" class="err" role="alert" style="margin-top:12px"></p></div>') +
      '<div class="card-box">' + (o.order_items || []).map(function (i) { return '<div class="row"><span>' + esc(i.product_name) + '<br><span class="mut small">' + (i.size ? 'Size ' + esc(i.size) + ' · ' : '') + 'Qty ' + i.quantity + '</span></span><span>' + money(i.unit_price_cents * i.quantity) + '</span></div>'; }).join('') +
      '<div class="row"><span>Delivery</span><span>' + (o.shipping_cents ? money(o.shipping_cents) : 'Free') + '</span></div><div class="row" style="border:0"><strong>Total</strong><strong>' + money(o.total_cents) + '</strong></div></div>' +
      '<div class="card-box"><strong>Delivering to</strong><p class="mut" style="margin:8px 0 0">' + esc(a.name) + '<br>' + esc(a.line1) + (a.suburb ? ', ' + esc(a.suburb) : '') + '<br>' + esc(a.city) + ', ' + esc(a.province || '') + ' ' + esc(a.postal_code || '') + '<br>' + esc(a.phone) + '</p></div>' +
      '<p style="text-align:center"><a class="btn" href="/shop">Continue shopping</a></p></section>';
  };

  V.account = async function () {
    if (!S.user) { S.next = '/account'; return nav('/login', true); }
    setMeta('My account', '', { noindex: true });
    var os = await D.orders(false);
    $('app').innerHTML = '<div class="page-h"><h1>My account</h1><p>' + esc(S.user.name ? S.user.name + ' · ' : '') + esc(S.user.email) + '</p></div><div class="narrow" style="padding-bottom:64px"><h3 style="margin-bottom:12px">Orders</h3>' +
      (os.length ? os.map(function (o) {
        return '<div class="card-box"><div class="row" style="border:0;padding:0"><span><strong>' + esc(o.reference || '#' + o.id) + '</strong> <span class="mut small">· ' + date(o.created_at) + '</span></span><span class="badge ' + esc(o.status) + '">' + esc(o.status) + '</span></div>' +
          '<p class="o-items">' + (o.order_items || []).map(function (i) { return esc(i.product_name) + (i.size ? ' (' + esc(i.size) + ')' : '') + ' ×' + i.quantity; }).join('<br>') + '</p>' +
          '<div class="row" style="border:0;padding:8px 0 0"><strong>' + money(o.total_cents) + '</strong><span>' + (o.status === 'pending' ? '<button class="btn btn-o sm" data-a="payorder" data-id="' + o.id + '">Pay now</button> ' : '') + '<a class="lnk" href="/order/' + esc(o.reference) + '">View</a></span></div></div>';
      }).join('') : '<p class="mut">You have not placed any orders yet. <a href="/shop" style="text-decoration:underline">Start shopping</a>.</p>') +
      '<p id="msg" class="err" role="alert"></p><p style="margin-top:32px"><button class="btn btn-o" data-a="out">Log out</button></p></div>';
  };

  function authView(mode) {
    var su = mode === 'signup', fg = mode === 'forgot', rs = mode === 'reset';
    setMeta(su ? 'Create account' : fg ? 'Reset password' : rs ? 'New password' : 'Log in', '', { noindex: true });
    $('app').innerHTML = '<section class="box"><h1>' + (su ? 'Create account' : fg ? 'Reset password' : rs ? 'Choose a new password' : 'Log in') + '</h1><form id="' + mode + '" novalidate>' +
      (su ? '<label for="n">Full name</label><input id="n" name="n" autocomplete="name" required>' : '') +
      (rs ? '' : '<label for="e">Email</label><input id="e" name="e" type="email" autocomplete="email" required>') +
      (fg ? '' : '<label for="p">' + (rs ? 'New password' : 'Password') + '</label><input id="p" name="p" type="password" minlength="8" autocomplete="' + (mode === 'login' ? 'current-password' : 'new-password') + '" required' + (mode === 'login' ? '' : ' placeholder="At least 8 characters"') + '>') +
      '<button class="btn btn-block">' + (su ? 'Create account' : fg ? 'Send reset link' : rs ? 'Save password' : 'Log in') + '</button><p id="msg" class="err" role="alert"></p></form>' +
      '<p class="mut" style="text-align:center">' + (su ? 'Already have an account? <a class="lnk" href="/login">Log in</a>' : fg || rs ? '<a class="lnk" href="/login">Back to log in</a>' : '<a href="/forgot" style="text-decoration:underline">Forgot password?</a><br><br>New here? <a class="lnk" href="/signup">Create an account</a>') + '</p>' +
      (!LIVE ? '<p class="mut small" style="text-align:center">Demo tip: any email works. Use one containing "admin" to open the admin page.</p>' : '') + '</section>';
  }
  V.login = async function () { authView('login'); };
  V.signup = async function () { authView('signup'); };
  V.forgot = async function () { authView('forgot'); };
  V.reset = async function () { authView('reset'); };

  /* ----- static content pages ----- */
  var UPDATED = 'October 2026';
  function page(title, desc, h1, sub, body) {
    setMeta(title, desc);
    $('app').innerHTML = '<div class="page-h"><h1>' + h1 + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div><div class="narrow prose">' + body + '</div>';
  }
  V.about = async function () {
    setMeta('About', BRAND + ' is performance luxury: shoes, bags, apparel and accessories made to look sharp and move with you.');
    $('app').innerHTML = '<div class="page-h"><span class="eyebrow">Our story</span><h1>Performance luxury</h1><p>' + esc(BRAND) + ' sits where training gear meets tailoring.</p></div>' +
      '<div class="wrap"><div class="about-grid"><img src="/images/long-sleeve.webp" alt="Model in a black Leevancci long sleeve with sunglasses" loading="lazy" width="800" height="1000"><div><h2 style="font-size:30px;margin-bottom:14px">Made to be worn hard and look good doing it</h2>' +
      '<p class="mut">' + esc(BRAND) + ' started with a simple idea: the pieces you train in and the pieces you go out in should come from the same standard. Clean lines, considered details and materials that hold up.</p>' +
      '<p class="mut">From crystal-studded sneakers and oxblood oxfords to structured bags, a gold-tone watch and everyday performance wear, every piece carries the same wordmark and the same attention to finish.</p>' +
      '<a class="btn" href="/shop" style="margin-top:12px">Shop the collection</a></div></div>' +
      '<div class="values"><div><h3>Considered design</h3><p>Restrained silhouettes, one confident detail. Nothing that shouts, everything that stands out.</p></div><div><h3>Built to last</h3><p>We choose finishes and materials for how they wear over seasons, not just how they photograph.</p></div><div><h3>Easy to buy</h3><p>Prices in rand, delivery across South Africa, secure checkout and a straightforward returns policy.</p></div></div></div>';
  };
  V.contact = async function () {
    setMeta('Contact', 'Questions about an order, sizing or delivery? Get in touch with ' + BRAND + '.');
    var d = '';
    if (B.email) d += '<dt>Email</dt><dd><a href="mailto:' + esc(B.email) + '">' + esc(B.email) + '</a></dd>';
    if (B.phone) d += '<dt>Phone</dt><dd><a href="tel:' + esc(B.phone.replace(/\s/g, '')) + '">' + esc(B.phone) + '</a></dd>';
    if (B.whatsapp) d += '<dt>WhatsApp</dt><dd><a href="https://wa.me/' + esc(B.whatsapp) + '" target="_blank" rel="noopener">Message us</a></dd>';
    if (B.instagram) d += '<dt>Instagram</dt><dd><a href="' + esc(B.instagram) + '" target="_blank" rel="noopener">Follow us</a></dd>';
    if (B.address) d += '<dt>Address</dt><dd>' + esc(B.address) + '</dd>';
    if (B.hours) d += '<dt>Hours</dt><dd>' + esc(B.hours) + '</dd>';
    $('app').innerHTML = '<div class="page-h"><h1>Contact us</h1><p>Questions about an order, sizing or delivery? We usually reply within one working day.</p></div><div class="wrap"><div class="contact-g"><form id="contact" novalidate>' +
      '<div class="two"><div><label for="cn">Name</label><input id="cn" name="n" autocomplete="name" required></div><div><label for="ce">Email</label><input id="ce" name="e" type="email" autocomplete="email" required></div></div>' +
      '<label for="cm">How can we help?</label><textarea id="cm" name="m" required></textarea><div class="hp" aria-hidden="true"><label for="cw">Website</label><input id="cw" name="w" tabindex="-1" autocomplete="off"></div>' +
      '<button class="btn">Send message</button><p id="msg" class="err" role="alert"></p></form><dl style="margin:0">' + (d || '<dt>Reply time</dt><dd>Within one working day</dd>') + '</dl></div>' +
      '<div class="faq narrow" style="padding:0"><h2 style="font-size:24px;margin-bottom:12px">Quick answers</h2>' +
      '<details><summary>How long does delivery take?</summary><p>Most orders arrive within 3–7 working days. Remote areas may take a little longer.</p></details>' +
      '<details><summary>Can I return an item?</summary><p>Yes. Unworn items can be returned within 7 days of delivery. See <a href="/shipping-returns" style="text-decoration:underline">Shipping &amp; returns</a>.</p></details>' +
      '<details><summary>Which payment methods do you accept?</summary><p>Cards and the other payment options Paystack shows at checkout. Your card details never touch our servers.</p></details>' +
      '<details><summary>How do I track my order?</summary><p>Log in and open <a href="/account" style="text-decoration:underline">My orders</a> to see its status. We will share tracking details once it ships.</p></details></div></div>';
  };
  V['shipping-returns'] = async function () {
    page('Shipping & returns', 'Delivery times, costs and our 7-day returns policy.', 'Shipping &amp; returns', 'Last updated ' + UPDATED,
      '<h2>Delivery</h2><p>We deliver to addresses within South Africa by courier. Orders are usually dispatched within 1–2 working days and arrive within 3–7 working days. Remote areas can take longer.</p>' +
      '<ul><li>Delivery is <strong>free</strong> on orders over ' + money(S.settings.free) + '.</li><li>Otherwise a flat rate of <strong>' + money(S.settings.ship) + '</strong> applies.</li><li>Please make sure someone is available to receive the parcel and that your phone number is correct, as the courier will call.</li></ul>' +
      '<h2>Returns and exchanges</h2><p>Changed your mind? You may return an item within <strong>7 days of receiving it</strong>, without giving a reason, as provided for by the Electronic Communications and Transactions Act.</p>' +
      '<ul><li>Items must be unworn, unwashed and in original condition with all tags and packaging.</li><li>For hygiene reasons, intimates and swimwear can only be returned unopened and unworn.</li><li>The cost of returning an item is for the customer unless it is faulty or incorrect.</li><li>Refunds go back to your original payment method within 10 working days of us receiving and checking the return.</li></ul>' +
      '<h2>Faulty or incorrect items</h2><p>If something arrives damaged, faulty or not as ordered, contact us within 6 months of delivery and we will repair, replace or refund it, in line with the Consumer Protection Act. Please include your order reference and a photo.</p>' +
      '<h2>How to start a return</h2><p>Email ' + contactLine() + ' with your order reference and the item you want to return. We will reply with return instructions.</p>');
  };
  V.privacy = async function () {
    page('Privacy policy', 'How ' + BRAND + ' collects, uses and protects your personal information.', 'Privacy policy', 'Last updated ' + UPDATED,
      '<p>' + esc(B.legalName || BRAND) + ' ("we", "us") respects your privacy and processes personal information in line with the Protection of Personal Information Act (POPIA).</p>' +
      '<h2>What we collect</h2><ul><li><strong>Account details:</strong> your name, email address and password (stored securely, never in plain text).</li><li><strong>Order details:</strong> delivery address, phone number and what you bought.</li><li><strong>Messages and sign-ups:</strong> anything you send through our contact form and your email if you join our mailing list.</li></ul>' +
      '<h2>What we do not collect</h2><p>We never see or store your card details. Payments are handled by Paystack, who process them under their own privacy policy and security standards.</p>' +
      '<h2>Why we use it</h2><ul><li>To process and deliver your orders and keep you updated.</li><li>To respond to your questions and returns.</li><li>To send news and offers, only if you subscribed, and you can unsubscribe at any time.</li><li>To meet legal, tax and fraud-prevention obligations.</li></ul>' +
      '<h2>Who we share it with</h2><p>Only the people we need to run your order: our payment provider (Paystack), couriers (name, address and phone number for delivery), and our hosting and database providers (Vercel and Supabase). We do not sell your information.</p>' +
      '<h2>Cookies and storage</h2><p>We use your browser\'s local storage to remember your cart and keep you logged in. We do not use advertising cookies.</p>' +
      '<h2>How long we keep it</h2><p>Order records are kept for as long as the law requires for tax and accounting. Other information is kept while your account is active or until you ask us to delete it.</p>' +
      '<h2>Your rights</h2><p>You may ask to see, correct or delete the personal information we hold about you, or object to marketing. Contact us at ' + contactLine() + '. If you are unhappy with how we handle your information you can complain to the Information Regulator at <a href="https://inforegulator.org.za" target="_blank" rel="noopener">inforegulator.org.za</a>.</p>');
  };
  V.terms = async function () {
    page('Terms of sale', 'The terms that apply when you buy from ' + BRAND + '.', 'Terms of sale', 'Last updated ' + UPDATED,
      '<p>These terms apply to purchases from this website, operated by ' + esc(B.legalName || BRAND) + '. By placing an order you agree to them.</p>' +
      '<h2>Orders</h2><p>An order is accepted once we have received your payment in full and sent you confirmation. We may cancel and refund an order if an item is out of stock, mispriced in error or we suspect fraud.</p>' +
      '<h2>Prices and payment</h2><p>All prices are in South African Rand (ZAR). Delivery is added at checkout where applicable. Payment is processed securely by Paystack.</p>' +
      '<h2>Delivery</h2><p>See our <a href="/shipping-returns">Shipping &amp; returns</a> page. Delivery times are estimates. Risk in the goods passes to you on delivery.</p>' +
      '<h2>Returns and refunds</h2><p>Our <a href="/shipping-returns">returns policy</a> forms part of these terms and does not limit your rights under the Consumer Protection Act or the Electronic Communications and Transactions Act.</p>' +
      '<h2>Product information</h2><p>We do our best to show colours and details accurately, but screens vary slightly. Pieces are described as accurately as we can.</p>' +
      '<h2>Intellectual property</h2><p>All images, text and branding on this site belong to us or our licensors and may not be copied or reused without permission.</p>' +
      '<h2>Governing law</h2><p>These terms are governed by the laws of the Republic of South Africa.</p>' +
      '<h2>Contact</h2><p>Questions? Reach us at ' + contactLine() + '.</p>');
  };

  V.notfound = async function () {
    setMeta('Page not found', '', { noindex: true });
    $('app').innerHTML = '<section class="box"><h1>Page not found</h1><p class="mut" style="text-align:center">That page does not exist or has moved.</p><p style="text-align:center"><a class="btn" href="/shop">Continue shopping</a></p></section>';
  };

  /* ----- admin ----- */
  V.admin = async function () {
    setMeta('Admin', '', { noindex: true });
    if (!S.user || !S.user.admin) { $('app').innerHTML = '<section class="box"><h1>Admin</h1><p class="mut" style="text-align:center">Admins only. Log in with an admin account.</p></section>'; return; }
    var tab = S.tab, body = '';
    if (tab === 'products') {
      var ps = await D.allProducts(), e = S.edit || {};
      body = '<form id="padd" novalidate><h3 style="margin-bottom:14px">' + (e.id ? 'Edit product' : 'Add product') + '</h3><label for="an">Name</label><input id="an" name="n" value="' + esc(e.name) + '" required>' +
        '<div class="two"><div><label for="ap">Price (ZAR)</label><input id="ap" name="p" type="number" step="0.01" min="0" value="' + (e.price_cents != null ? e.price_cents / 100 : '') + '" required></div><div><label for="as">Stock (blank = not tracked)</label><input id="as" name="s" type="number" min="0" value="' + (e.stock != null ? e.stock : '') + '"></div></div>' +
        '<div class="two"><div><label for="ac">Category</label><input id="ac" name="c" list="cl" value="' + esc(e.category) + '"><datalist id="cl">' + cats().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist></div><div><label for="az">Sizes (comma separated)</label><input id="az" name="z" placeholder="S, M, L or 38, 39, 40" value="' + esc((e.sizes || []).join(', ')) + '"></div></div>' +
        '<label for="ad">Description</label><textarea id="ad" name="d">' + esc(e.description) + '</textarea>' +
        '<label for="ai">Main photo' + (e.id ? ' (leave empty to keep current)' : '') + '</label><input id="ai" name="i" type="file" accept="image/*"><label for="ag">Extra photos (optional)</label><input id="ag" name="g" type="file" accept="image/*" multiple>' +
        '<label style="display:flex;gap:8px;align-items:center;margin-bottom:14px"><input type="checkbox" name="a" style="width:auto;margin:0" ' + (e.is_active === false ? '' : 'checked') + '> Visible in the shop</label>' +
        '<button class="btn">' + (e.id ? 'Save changes' : 'Add product') + '</button> ' + (e.id ? '<button type="button" class="btn btn-o" data-a="canceledit">Cancel</button>' : '') + '<p id="msg" class="err" role="alert"></p></form>' +
        '<h3 style="margin:32px 0 6px">Products (' + ps.length + ')</h3><div class="admin-tbl">' + ps.map(function (p) {
          return '<div class="row"><span style="display:flex;gap:12px;align-items:center"><img class="thumb-s" src="' + esc(img(p.image)) + '" alt="" width="56" height="56"><span>' + esc(p.name) + (p.is_active === false ? ' <span class="badge">hidden</span>' : '') + '<br><span class="mut small">' + money(p.price_cents) + ' · ' + esc(p.category || 'No category') + ' · ' + (p.stock == null ? 'stock not tracked' : p.stock + ' in stock') + '</span></span></span>' +
            '<span><button class="sm" data-a="editp" data-id="' + p.id + '">Edit</button> <button class="sm" data-a="del" data-id="' + p.id + '">Delete</button></span></div>';
        }).join('') + '</div>';
    } else if (tab === 'messages') {
      var ms = await D.messages(), subs = await D.subscribers();
      body = '<h3 style="margin-bottom:6px">Messages (' + ms.length + ')</h3>' + (ms.map(function (m) { return '<div class="card-box"><strong>' + esc(m.name) + '</strong> · <a href="mailto:' + esc(m.email) + '" style="text-decoration:underline">' + esc(m.email) + '</a> <span class="mut small">· ' + date(m.created_at) + '</span><p style="margin:8px 0 0;white-space:pre-wrap">' + esc(m.message) + '</p></div>'; }).join('') || '<p class="mut">No messages yet.</p>') +
        '<h3 style="margin:28px 0 6px">Newsletter (' + subs.length + ')</h3><button class="btn btn-o sm" data-a="copysubs">Copy all emails</button><p class="mut small" id="subs" style="word-break:break-all;margin-top:12px">' + subs.map(esc).join(', ') + '</p>';
    } else {
      var os = await D.orders(true);
      body = '<h3 style="margin-bottom:6px">Orders (' + os.length + ')</h3><div class="admin-tbl">' + (os.map(function (o) {
        var a = o.shipping_address || {};
        return '<div class="card-box"><div class="row" style="border:0;padding:0"><span><strong>' + esc(o.reference || '#' + o.id) + '</strong> <span class="mut small">· ' + date(o.created_at) + '</span></span><span><strong>' + money(o.total_cents) + '</strong> <select data-oid="' + o.id + '" aria-label="Order status">' + STATUSES.map(function (s) { return '<option' + (s === o.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></span></div>' +
          '<p class="o-items">' + (o.order_items || []).map(function (i) { return esc(i.product_name) + (i.size ? ' (' + esc(i.size) + ')' : '') + ' ×' + i.quantity; }).join('<br>') + '</p>' +
          '<p class="mut small" style="margin:8px 0 0">' + esc(a.name) + ' · ' + esc(a.phone) + ' · ' + esc(o.customer_email || a.email || '') + '<br>' + esc(a.line1) + (a.suburb ? ', ' + esc(a.suburb) : '') + ', ' + esc(a.city) + ', ' + esc(a.province || '') + ' ' + esc(a.postal_code || '') + '</p></div>';
      }).join('') || '<p class="mut">No orders yet.</p>') + '</div>';
    }
    $('app').innerHTML = '<div class="page-h"><h1>Admin</h1></div><div class="wrap" style="max-width:900px;padding-bottom:64px"><div class="tabs" role="tablist">' +
      ['orders', 'products', 'messages'].map(function (t) { return '<button role="tab" data-a="tab" data-t="' + t + '" aria-selected="' + (t === tab) + '">' + t + '</button>'; }).join('') + '</div>' + body + '</div>';
  };

  /* ==========================================================================
     ROUTER
     ========================================================================== */
  var ROUTES = [
    [/^\/$/, 'home'], [/^\/shop$/, 'shop'], [/^\/product\/([^/]+)$/, 'product'], [/^\/checkout$/, 'checkout'],
    [/^\/order\/([^/]+)$/, 'order'], [/^\/account$/, 'account'], [/^\/login$/, 'login'], [/^\/signup$/, 'signup'],
    [/^\/forgot$/, 'forgot'], [/^\/reset$/, 'reset'], [/^\/about$/, 'about'], [/^\/contact$/, 'contact'],
    [/^\/shipping-returns$/, 'shipping-returns'], [/^\/privacy$/, 'privacy'], [/^\/terms$/, 'terms'], [/^\/admin$/, 'admin']
  ];
  var navSeq = 0;
  async function render(scroll) {
    var seq = ++navSeq, path = location.pathname.replace(/\/+$/, '') || '/', view = 'notfound', arg;
    for (var i = 0; i < ROUTES.length; i++) { var m = path.match(ROUTES[i][0]); if (m) { view = ROUTES[i][1]; arg = m[1] && decodeURIComponent(m[1]); break; } }
    $('nav').classList.remove('open'); document.querySelector('.menu-btn').setAttribute('aria-expanded', 'false');
    closeCart();
    $('app').setAttribute('aria-busy', 'true');
    try {
      await V[view](arg);
      if (view !== 'checkout' && view !== 'order' && view !== 'account' && view !== 'admin') { /* catalogue-backed pages loaded above */ }
    } catch (err) {
      console.error(err);
      if (seq === navSeq) $('app').innerHTML = '<section class="box"><h1>Something went wrong</h1><p class="mut" style="text-align:center">' + esc(errText(err)) + '</p><p style="text-align:center"><button class="btn" data-a="reload">Try again</button></p></section>';
    }
    if (seq !== navSeq) return;
    $('app').removeAttribute('aria-busy');
    syncCart(); renderHeader();
    if ($('foot').dataset.c !== String(cats().length)) { renderFooter(); $('foot').dataset.c = cats().length; }
    if (scroll !== false) { window.scrollTo(0, 0); $('app').focus({ preventScroll: true }); }
  }
  function nav(path, replace) {
    if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path);
    return render();
  }
  async function refreshUser() { try { S.user = await D.user(); } catch (e) { S.user = null; } }

  /* ==========================================================================
     PAYMENT
     ========================================================================== */
  async function startPayment(order, msgEl) {
    var say = function (t) { if (msgEl) msgEl.textContent = t; else toast(t); };
    if (!LIVE) {
      if (confirm('DEMO MODE\n\nSimulate a successful Paystack payment of ' + money(order.total_cents) + '?')) { D.demoPaid(order.reference); S.cart = []; drawCart(); return nav('/order/' + order.reference); }
      return say('Payment cancelled. Your order is saved as pending in My orders.');
    }
    if (!C.paystackPublicKey) return say('Card payments are not switched on yet. Your order is saved as pending, so please contact us to complete it.');
    try { await loadScript(PAYSTACK_JS); } catch (e) { return say('Could not load the payment window. Check your connection and try again.'); }
    var done = false;
    var h = window.PaystackPop.setup({
      key: C.paystackPublicKey, email: order.email, amount: order.total_cents, currency: 'ZAR', ref: order.reference,
      metadata: { order_id: order.id, custom_fields: [{ display_name: 'Order', variable_name: 'order', value: order.reference }] },
      callback: function (r) {
        done = true; toast('Confirming your payment…');
        D.verify(r.reference || order.reference).then(function (v) {
          if (v.ok) { S.cart = []; drawCart(); }
          nav('/order/' + order.reference); // the order page shows "pending" with a re-check button if needed
        }).catch(function () { nav('/order/' + order.reference); });
      },
      onClose: function () { if (!done) say('Payment window closed. Your order is saved as pending in My orders if you would like to finish later.'); }
    });
    h.openIframe();
  }

  /* ==========================================================================
     EVENTS
     ========================================================================== */
  document.addEventListener('click', async function (e) {
    var a = e.target.closest('a[href]');
    if (a && !e.defaultPrevented && !e.button && !e.metaKey && !e.ctrlKey && !e.shiftKey && !a.target && !a.hasAttribute('download') && !a.hasAttribute('data-native')) {
      var u = new URL(a.href, location.href);
      if (u.origin === location.origin && u.pathname.indexOf('/api/') !== 0 && !/\.[a-z0-9]+$/i.test(u.pathname) && !(u.pathname === location.pathname && u.search === location.search && u.hash)) {
        e.preventDefault(); closeCart(); history.pushState(null, '', u.pathname + u.search + u.hash); render(); return;
      }
    }
    var b = e.target.closest('[data-a]'); if (!b) return;
    var act = b.dataset.a, key = b.dataset.k, line;
    var find = function () { return S.cart.filter(function (i) { return cartKey(i) === key; })[0]; };
    if (act === 'menu') { var n = $('nav'), o = n.classList.toggle('open'); b.setAttribute('aria-expanded', o); }
    else if (act === 'cart') openCart();
    else if (act === 'close') closeCart();
    else if (act === 'checkout') { closeCart(); nav('/checkout'); }
    else if (act === 'inc' || act === 'dec') {
      line = find(); if (!line) return;
      var p = (S.products || []).filter(function (x) { return x.id == line.id; })[0], cap = p && p.stock != null ? Math.min(10, p.stock) : 10;
      if (act === 'inc') { if (line.qty < cap) line.qty++; else toast('That is the maximum available.'); } else line.qty = Math.max(1, line.qty - 1);
      drawCart(); if ($('ship')) V.checkout();
    }
    else if (act === 'rm') { S.cart = S.cart.filter(function (i) { return cartKey(i) !== key; }); drawCart(); if (location.pathname === '/checkout') V.checkout(); }
    else if (act === 'out') { await D.logout(); S.user = null; renderHeader(); nav('/'); toast('You have been logged out.'); }
    else if (act === 'reload') { S.products = null; render(false); }
    else if (act === 'thumb') { $('gm').src = b.dataset.i; Array.prototype.forEach.call(document.querySelectorAll('.thumbs button'), function (x) { x.setAttribute('aria-current', x === b); }); }
    else if (act === 'q+' || act === 'q-') { S.sel.qty = Math.min(10, Math.max(1, S.sel.qty + (act === 'q+' ? 1 : -1))); $('qv').textContent = S.sel.qty; }
    else if (act === 'buy') {
      var prod = S.products.filter(function (x) { return x.id == b.dataset.id; })[0], sz = document.querySelector('input[name=size]:checked');
      if (prod.sizes.length && !sz) { $('buy-err').textContent = 'Please select a size.'; document.querySelector('.sizes').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      $('buy-err').textContent = '';
      if (addToCart(prod, sz ? sz.value : '', S.sel.qty)) { openCart(); }
    }
    else if (act === 'cat') { S.shop.cat = b.dataset.c; shopDraw(); }
    else if (act === 'clear') { S.shop = { cat: '', q: '', sort: '' }; $('q').value = ''; $('sort').value = ''; shopDraw(); }
    else if (act === 'tab') { S.tab = b.dataset.t; S.edit = null; V.admin(); }
    else if (act === 'editp') { var all = await D.allProducts(); S.edit = all.filter(function (x) { return x.id == b.dataset.id; })[0]; await V.admin(); window.scrollTo(0, 0); }
    else if (act === 'canceledit') { S.edit = null; V.admin(); }
    else if (act === 'del' && confirm('Delete this product? Products that already appear on orders will be hidden instead.')) { var r = await D.delProduct(b.dataset.id); if (r.error) toast(errText(r.error)); S.products = null; await D.products(true); V.admin(); }
    else if (act === 'copysubs') { var t = $('subs').textContent; try { await navigator.clipboard.writeText(t); toast('Copied.'); } catch (x) { toast('Select and copy the emails manually.'); } }
    else if (act === 'recheck' || act === 'payorder') {
      setBusy(b, true, 'Please wait…'); var m = $('msg');
      try {
        if (act === 'recheck') {
          if (!LIVE) { D.demoPaid(b.dataset.ref); return render(false); }
          var v = await D.verify(b.dataset.ref); if (v.ok) return render(false); if (m) m.textContent = 'Still pending. If you were charged, please contact us with your reference.';
        } else {
          var rr = await D.renew(b.dataset.id); if (rr.error) { if (m) m.textContent = errText(rr.error); else toast(errText(rr.error)); }
          else await startPayment(rr.order, m);
        }
      } finally { setBusy(b, false); }
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'q' && S.shop) { S.shop.q = e.target.value.trim(); shopDraw(); }
  });
  document.addEventListener('change', async function (e) {
    if (e.target.id === 'sort' && S.shop) { S.shop.sort = e.target.value; shopDraw(); }
    if (e.target.dataset.oid) { var r = await D.setStatus(e.target.dataset.oid, e.target.value); toast(r.error ? errText(r.error) : 'Status updated.'); }
  });
  document.addEventListener('keydown', function (e) {
    var c = $('cart'); if (!c.classList.contains('open')) return;
    if (e.key === 'Escape') { closeCart(); return; }
    if (e.key === 'Tab') { // keep focus inside the drawer
      var f = c.querySelectorAll('a[href],button:not([disabled]),input,select'); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener('popstate', function () { render(); });

  document.addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target, id = f.id || f.dataset.f, btn = f.querySelector('button:not([type=button])');
    var v = function (n) { return f.elements[n] ? f.elements[n].value.trim() : ''; }, m = $('msg'), say = function (t, ok) { if (m) { m.textContent = t; m.className = 'err' + (ok ? ' ok' : ''); } };
    if (m) say('');
    try {
      if (id === 'nl') {
        var out = f.nextElementSibling; out.textContent = '';
        if (!emailOk(v('e'))) { out.textContent = 'Please enter a valid email address.'; return; }
        setBusy(btn, true, '…'); var r = await D.subscribe(v('e')); setBusy(btn, false);
        if (r.error) out.textContent = 'Sorry, that did not work. Please try again.'; else { out.textContent = 'You are on the list. Thank you!'; f.reset(); }
      }
      else if (id === 'login' || id === 'signup') {
        if (id === 'signup' && !v('n')) return say('Please enter your name.');
        if (!emailOk(v('e'))) return say('Please enter a valid email address.');
        if (v('p').length < (id === 'signup' ? 8 : 6)) return say('Password must be at least 8 characters.');
        setBusy(btn, true, 'Please wait…');
        var r1 = id === 'signup' ? await D.signup(v('n'), v('e'), v('p')) : await D.login(v('e'), v('p'));
        setBusy(btn, false);
        if (r1.error) return say(r1.error.message);
        if (r1.msg) return say(r1.msg, true);
        await refreshUser(); renderHeader();
        var nx = S.next || (S.cart.length && id === 'signup' ? '/checkout' : '/'); S.next = null; nav(nx);
      }
      else if (id === 'forgot') {
        if (!emailOk(v('e'))) return say('Please enter a valid email address.');
        setBusy(btn, true, 'Sending…'); var r2 = await D.forgot(v('e')); setBusy(btn, false);
        say(r2.error ? r2.error.message : 'If that email has an account, a reset link is on its way.', !r2.error);
      }
      else if (id === 'reset') {
        if (v('p').length < 8) return say('Password must be at least 8 characters.');
        setBusy(btn, true, 'Saving…'); var r3 = await D.newPassword(v('p')); setBusy(btn, false);
        if (r3.error) return say(r3.error.message); toast('Password updated.'); nav('/account');
      }
      else if (id === 'contact') {
        if (v('w')) return; // honeypot
        if (!v('n') || !emailOk(v('e')) || v('m').length < 5) return say('Please complete all fields with a valid email.');
        setBusy(btn, true, 'Sending…'); var r4 = await D.contact({ name: v('n'), email: v('e'), message: v('m') }); setBusy(btn, false);
        if (r4.error) return say('Sorry, we could not send that. Please try again' + (B.email ? ' or email ' + B.email : '') + '.');
        f.reset(); say('Thank you. Your message has been sent and we will reply soon.', true);
      }
      else if (id === 'ship') {
        var addr = { name: v('name'), phone: v('phone'), line1: v('line1'), suburb: v('suburb'), city: v('city'), province: v('province'), postal_code: v('postal_code'), country: 'South Africa', email: S.user.email };
        if (!addr.name || !addr.line1 || !addr.city || !addr.province) return say('Please complete all required delivery fields.');
        if (!/^[0-9+()\s-]{9,16}$/.test(addr.phone)) return say('Please enter a valid phone number.');
        if (!/^\d{4}$/.test(addr.postal_code)) return say('Postal code should be 4 digits.');
        LS.set('lv_addr', addr);
        setBusy(btn, true, 'Preparing payment…');
        var r5 = await D.order(addr);
        if (r5.error) { setBusy(btn, false); if (/no longer available|out of stock/i.test(r5.error.message)) { S.products = null; await D.products(true); syncCart(); } return say(errText(r5.error)); }
        await startPayment(r5.order, m); setBusy(btn, false);
      }
      else if (id === 'padd') {
        var price = parseFloat(v('p'));
        if (!v('n') || isNaN(price) || price < 0) return say('Please enter a name and a valid price.');
        var row = { name: v('n'), price_cents: Math.round(price * 100), description: v('d'), category: v('c') || null,
          sizes: v('z') ? v('z').split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [], stock: v('s') === '' ? null : parseInt(v('s'), 10), is_active: f.elements.a.checked };
        setBusy(btn, true, 'Saving…');
        var main = f.elements.i.files[0], extra = Array.prototype.slice.call(f.elements.g.files);
        if (main) row.image = await D.uploadImage(main);
        if (extra.length) row.gallery = await Promise.all(extra.map(function (x) { return D.uploadImage(x); }));
        if (!S.edit) { if (!main) { setBusy(btn, false); return say('Please add a main photo.'); } row.slug = slugify(row.name) + '-' + Date.now().toString(36); }
        var r6 = await D.saveProduct(row, S.edit && S.edit.id); setBusy(btn, false);
        if (r6.error) return say(errText(r6.error));
        S.edit = null; S.products = null; await D.products(true); toast('Saved.'); V.admin();
      }
    } catch (err) { setBusy(btn, false); console.error(err); say(errText(err)); }
  });

  /* ==========================================================================
     BOOT
     ========================================================================== */
  (async function boot() {
    drawCart();
    if (LIVE) {
      try {
        await loadScript(SUPABASE_JS);
        sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);
        sb.auth.onAuthStateChange(function (ev) {
          setTimeout(async function () { await refreshUser(); renderHeader(); if (ev === 'PASSWORD_RECOVERY') nav('/reset', true); }, 0);
        });
        await D.settings();
      } catch (err) {
        console.error(err);
        $('app').innerHTML = '<section class="box"><h1>We will be right back</h1><p class="mut" style="text-align:center">The store is temporarily unavailable. Please try again in a moment.</p></section>';
        return;
      }
    }
    await refreshUser();
    drawCart();
    await render(false);
  })();
})();
