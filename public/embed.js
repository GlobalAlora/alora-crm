/* Alora CRM — Embeddable Lead Form Loader
 * Usage:
 *   Inline:  <script src="https://app.com/embed.js" data-form-id="abc123"></script>
 *   Widget:  <script src="https://app.com/embed.js" data-form-id="abc123" data-mode="widget" data-color="#2563eb"></script>
 *   JS API:  window.AloraLeadForm.open() / .close() / .toggle()
 */
(function (global) {
  'use strict';

  var script = document.currentScript;
  if (!script || script.getAttribute('data-alora-init') === '1') return;
  script.setAttribute('data-alora-init', '1');

  var formId  = script.getAttribute('data-form-id') || '';
  var mode    = script.getAttribute('data-mode') || 'inline';
  var color   = script.getAttribute('data-color') || '#2563eb';
  var baseUrl = script.src.replace(/\/embed\.js(\?.*)?$/, '');

  /* ── Styles injected once ──────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('alora-embed-styles')) return;
    var s = document.createElement('style');
    s.id = 'alora-embed-styles';
    s.textContent = [
      '.alora-iframe{width:100%;border:none;display:block;min-height:480px;transition:min-height .3s ease}',
      '.alora-widget-btn{position:fixed;bottom:24px;right:24px;z-index:2147483640;width:56px;height:56px',
        ';border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center',
        ';justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,.25);transition:transform .2s ease}',
      '.alora-widget-btn:hover{transform:scale(1.08)!important}',
      '.alora-widget-panel{position:fixed;bottom:96px;right:24px;z-index:2147483639',
        ';width:420px;max-width:calc(100vw - 48px);background:#fff',
        ';border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.2)',
        ';overflow:hidden;display:none;animation:alora-slide-in .2s ease}',
      '@keyframes alora-slide-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}',
    ].join('');
    document.head.appendChild(s);
  }

  /* ── iframe factory ────────────────────────────────────────────── */
  function buildIframeUrl(extra) {
    var url = baseUrl + '/embed/form?formId=' + encodeURIComponent(formId);
    if (extra) url += '&' + extra;
    return url;
  }

  function createIframe(src, minHeight) {
    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.className = 'alora-iframe';
    if (minHeight) iframe.style.minHeight = minHeight;
    iframe.setAttribute('allowtransparency', 'true');
    iframe.setAttribute('scrolling', 'no');
    iframe.setAttribute('title', 'Alora Lead Form');
    return iframe;
  }

  /* ── Auto-resize via postMessage ───────────────────────────────── */
  function listenResize(iframe) {
    global.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'alora:resize') return;
      if (iframe.src.indexOf(baseUrl) !== 0) return;
      iframe.style.minHeight = (e.data.height + 24) + 'px';
    });
  }

  /* ── Inline mode ───────────────────────────────────────────────── */
  function initInline() {
    var iframe = createIframe(buildIframeUrl());
    script.parentNode.insertBefore(iframe, script);
    listenResize(iframe);
    return { open: noop, close: noop, toggle: noop };
  }

  /* ── Widget mode ───────────────────────────────────────────────── */
  function initWidget() {
    var panel = document.createElement('div');
    panel.className = 'alora-widget-panel';

    var iframe = createIframe(buildIframeUrl('_widget=1'), '520px');
    panel.appendChild(iframe);
    listenResize(iframe);

    var btn = document.createElement('button');
    btn.className = 'alora-widget-btn';
    btn.setAttribute('aria-label', 'Abrir formulario de contacto');
    btn.style.background = color;
    btn.innerHTML = CHAT_ICON;

    var isOpen = false;

    function open() {
      isOpen = true;
      panel.style.display = 'block';
      btn.style.transform = 'rotate(45deg) scale(1)';
      btn.setAttribute('aria-expanded', 'true');
      btn.innerHTML = CLOSE_ICON;
    }
    function close() {
      isOpen = false;
      panel.style.display = 'none';
      btn.style.transform = 'rotate(0deg)';
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = CHAT_ICON;
    }
    function toggle() { isOpen ? close() : open(); }

    btn.addEventListener('click', toggle);

    // Close on ESC
    global.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) close();
    });

    document.body.appendChild(panel);
    document.body.appendChild(btn);

    return { open: open, close: close, toggle: toggle };
  }

  /* ── SVG icons ─────────────────────────────────────────────────── */
  var CHAT_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var CLOSE_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  function noop() {}

  /* ── Bootstrap ─────────────────────────────────────────────────── */
  function boot() {
    injectStyles();
    var instance = mode === 'widget' ? initWidget() : initInline();

    // Global API — supports multiple instances
    if (!global.AloraLeadForm) {
      global.AloraLeadForm = {
        _instances: [],
        open:   function () { this._instances.forEach(function (i) { i.open(); }); },
        close:  function () { this._instances.forEach(function (i) { i.close(); }); },
        toggle: function () { this._instances.forEach(function (i) { i.toggle(); }); },
      };
    }
    global.AloraLeadForm._instances.push(instance);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);
