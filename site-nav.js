/* ============================================================
   site-nav.js — the shared site header and footer.

   Drop this into any page and it grows a menu:

       <script src="/site-nav.js" defer></script>

   It reads nav-data.json, so the menu is edited in one place and
   every page updates. It injects its own CSS, so a page needs no
   extra markup. The current page is marked in the menu.

   Pages that are embedded inside another site (the Squarespace
   iframes) should NOT include this — they would show a second menu
   inside the page. It skips itself automatically when framed.
   ============================================================ */
(function () {
  'use strict';

  // Inside an iframe the host page already has a menu; adding another
  // would nest two headers. Bail out.
  try {
    if (window.self !== window.top) return;
  } catch (e) {
    return;                       // cross-origin frame: assume embedded
  }

  if (document.getElementById('swd-site-header')) return;   // already added

  var CSS = [
    ':root{--swdnav-ink:#172033;--swdnav-soft:#4a5568;--swdnav-navy:#1a365d;',
    '--swdnav-line:rgba(15,23,42,.10);--swdnav-line2:rgba(15,23,42,.16);',
    '--swdnav-bg:#f5f7fa;--swdnav-deep:#0f2440;}',
    '#swd-site-header{position:sticky;top:0;z-index:900;background:#fff;',
    'border-bottom:1px solid var(--swdnav-line);font-family:-apple-system,',
    'BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}',
    '#swd-site-header *{box-sizing:border-box;}',
    '.swdnav-bar{max-width:1180px;margin:0 auto;padding:0 20px;display:flex;',
    'align-items:center;gap:16px;min-height:66px;}',
    '.swdnav-brand{display:flex;align-items:center;gap:10px;text-decoration:none;flex:0 0 auto;}',
    '.swdnav-brand img{height:38px;width:auto;display:block;}',
    '.swdnav-brand span{font-weight:700;font-size:14px;color:var(--swdnav-navy);line-height:1.15;}',
    '.swdnav{margin-left:auto;}',
    '.swdnav>ul{list-style:none;display:flex;flex-wrap:wrap;justify-content:flex-end;',
    'gap:1px;margin:0;padding:0;align-items:center;}',
    '.swdnav li{position:relative;}',
    '.swdnav a,.swdnav button{display:block;padding:8px 10px;font-size:13px;font-weight:500;',
    'color:var(--swdnav-soft);text-decoration:none;border-radius:6px;background:none;',
    'border:0;cursor:pointer;font-family:inherit;white-space:nowrap;}',
    '.swdnav a:hover,.swdnav button:hover{color:var(--swdnav-navy);background:var(--swdnav-bg);}',
    '.swdnav a.on{color:var(--swdnav-navy);font-weight:700;}',
    '.swdnav button::after{content:"";display:inline-block;margin-left:6px;',
    'border:4px solid transparent;border-top-color:currentColor;transform:translateY(2px);}',
    '.swdnav ul.sub{position:absolute;top:100%;left:0;min-width:230px;list-style:none;',
    'margin:4px 0 0;padding:6px;background:#fff;border:1px solid var(--swdnav-line2);',
    'border-radius:10px;box-shadow:0 12px 32px -12px rgba(15,23,42,.28);display:none;}',
    '.swdnav li.open>ul.sub{display:block;}',
    '.swdnav ul.sub a{white-space:normal;padding:8px 11px;}',
    '.swdnav-toggle{display:none;margin-left:auto;background:none;',
    'border:1px solid var(--swdnav-line2);border-radius:8px;padding:8px 12px;',
    'cursor:pointer;font:inherit;font-size:14px;color:var(--swdnav-ink);}',
    '@media(max-width:1200px){.swdnav-toggle{display:block;}',
    '.swdnav{display:none;width:100%;order:3;margin:0 0 12px;padding-top:8px;',
    'border-top:1px solid var(--swdnav-line);}',
    '.swdnav.show{display:block;}.swdnav-bar{flex-wrap:wrap;}',
    '.swdnav>ul{flex-direction:column;align-items:stretch;gap:0;}',
    '.swdnav a,.swdnav button{width:100%;text-align:left;padding:11px 8px;}',
    '.swdnav ul.sub{position:static;display:none;box-shadow:none;border:0;',
    'border-left:2px solid var(--swdnav-line2);border-radius:0;margin:0 0 6px 12px;padding:0 0 0 8px;}}',
    '#swd-site-footer{background:var(--swdnav-deep);color:rgba(255,255,255,.8);',
    'padding:34px 0 26px;margin-top:48px;font-size:.9rem;font-family:-apple-system,',
    'BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}',
    '#swd-site-footer .in{max-width:1180px;margin:0 auto;padding:0 20px;display:flex;',
    'flex-wrap:wrap;gap:10px 24px;justify-content:space-between;align-items:center;}',
    '#swd-site-footer a{color:rgba(255,255,255,.82);text-decoration:none;}',
    '#swd-site-footer a:hover{color:#fff;text-decoration:underline;}'
  ].join('');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) {
    return /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(String(u || '')) ? String(u) : '#';
  }
  function samePage(href) {
    if (!href || href.charAt(0) !== '/') return false;
    var here = location.pathname.replace(/\/+$/, '') || '/';
    return href.split('?')[0].replace(/\/+$/, '') === here;
  }

  function build(nav) {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var brand = nav.brand || {};
    var header = document.createElement('header');
    header.id = 'swd-site-header';
    header.innerHTML =
      '<div class="swdnav-bar">' +
        '<a class="swdnav-brand" href="' + esc(safeUrl(brand.href || '/')) + '">' +
          (brand.logo ? '<img src="' + esc(safeUrl(brand.logo)) + '" alt="">' : '') +
          '<span>Southwest<br>Lawn Bowls</span>' +
        '</a>' +
        '<button class="swdnav-toggle" type="button" aria-expanded="false">Menu</button>' +
        '<nav class="swdnav" aria-label="Main"><ul>' +
          (nav.items || []).map(function (it) {
            if (it.children && it.children.length) {
              return '<li><button type="button" aria-expanded="false">' + esc(it.label) + '</button>' +
                '<ul class="sub">' + it.children.map(function (c) {
                  return '<li><a class="' + (samePage(c.href) ? 'on' : '') + '" href="' +
                    esc(safeUrl(c.href)) + '">' + esc(c.label) + '</a></li>';
                }).join('') + '</ul></li>';
            }
            var ext = it.external ? ' target="_blank" rel="noopener"' : '';
            return '<li><a class="' + (samePage(it.href) ? 'on' : '') + '" href="' +
              esc(safeUrl(it.href)) + '"' + ext + '>' + esc(it.label) + '</a></li>';
          }).join('') +
        '</ul></nav>' +
      '</div>';
    document.body.insertBefore(header, document.body.firstChild);

    var footer = document.createElement('footer');
    footer.id = 'swd-site-footer';
    footer.innerHTML =
      '<div class="in">' +
        '<span>&copy; ' + new Date().getFullYear() + ' Southwest Bowls Division</span>' +
        '<span>' + (nav.footerLinks || []).map(function (l) {
          return '<a href="' + esc(safeUrl(l.href)) + '">' + esc(l.label) + '</a>';
        }).join(' &middot; ') + '</span>' +
      '</div>';
    document.body.appendChild(footer);

    wire(header);
  }

  function wire(header) {
    var list = header.querySelector('.swdnav > ul');
    var menu = header.querySelector('.swdnav');
    var toggle = header.querySelector('.swdnav-toggle');

    function closeAll() {
      Array.prototype.forEach.call(list.querySelectorAll('li.open'), function (li) {
        li.classList.remove('open');
        var b = li.querySelector('button');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
    }

    list.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button') : null;
      if (!btn) return;
      var li = btn.parentNode, open = li.classList.contains('open');
      closeAll();
      if (!open) { li.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
      e.stopPropagation();
    });
    document.addEventListener('click', closeAll);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });

    toggle.addEventListener('click', function () {
      var shown = menu.classList.toggle('show');
      toggle.setAttribute('aria-expanded', shown ? 'true' : 'false');
    });
  }

  function start() {
    fetch('/nav-data.json?v=' + Date.now())
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(build)
      .catch(function () { /* no menu is better than a broken page */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
