/* =========================================================================
   Мария Курочкина — фотограф. Поведение страницы.
   Ванильный JS, без зависимостей.
   ========================================================================= */
(function () {
  'use strict';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- шапка */
  var hdr = $('#hdr');
  var onScroll = function () {
    hdr.classList.toggle('is-stuck', window.scrollY > 40);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ------------------------------------------------------- мобильное меню */
  var navToggle = $('#navToggle');
  var nav = $('#nav');
  var closeNav = function () {
    nav.classList.remove('is-open');
    navToggle.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('is-locked');
  };
  navToggle.addEventListener('click', function () {
    var open = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    navToggle.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('is-locked', open);
  });
  $$('#nav a').forEach(function (a) { a.addEventListener('click', closeNav); });

  /* ------------------------------------------- появление блоков при скролле */
  var io = null;
  if ('IntersectionObserver' in window && !reduced) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    $$('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ================================================================ ГАЛЕРЕЯ */
  var grid = $('#grid');
  if (!grid) return;

  var tiles     = $$('.tile', grid);
  var filters   = $$('#filters button');
  var moreWrap  = $('#gridMore');
  var moreBtn   = $('#moreBtn');
  var PAGE      = 18;

  var current = 'all';   // активный жанр
  var shown   = PAGE;    // сколько плиток показано
  var visible = [];      // плитки текущего фильтра — порядок для просмотра

  function matches(tile) {
    return current === 'all' || tile.dataset.genre === current;
  }

  function render() {
    visible = tiles.filter(matches);
    tiles.forEach(function (t) { t.classList.add('is-hidden'); });

    visible.slice(0, shown).forEach(function (t, i) {
      t.classList.remove('is-hidden');
      t.dataset.idx = String(i);
      if (reduced || !io) { t.classList.add('is-in'); }
      else if (!t.classList.contains('is-in')) { io.observe(t); }
    });
    // плитки за пределами страницы всё равно должны быть готовы к показу
    visible.slice(shown).forEach(function (t, i) { t.dataset.idx = String(shown + i); });

    var rest = visible.length - shown;
    moreWrap.hidden = rest <= 0;
    if (rest > 0) moreBtn.firstChild.nodeValue = 'Показать ещё ' + Math.min(rest, PAGE) + ' ';
  }

  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      filters.forEach(function (b) { b.setAttribute('aria-selected', 'false'); });
      btn.setAttribute('aria-selected', 'true');
      current = btn.dataset.genre;
      shown = PAGE;
      render();
      var anchor = $('#filters');
      var top = anchor.getBoundingClientRect().top + window.scrollY - 96;
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  moreBtn.addEventListener('click', function () {
    shown += PAGE;
    render();
  });

  render();

  /* ====================================================== ПОЛНОЭКРАННЫЙ ВИД */
  var lb      = $('#lb');
  var lbImg   = $('#lbImg');
  var lbTitle = $('#lbTitle');
  var lbGenre = $('#lbGenre');
  var lbCount = $('#lbCount');
  var lbStrip = $('#lbStrip');
  var idx = 0;
  var lastFocus = null;

  function preload(i) {
    if (i < 0 || i >= visible.length) return;
    var im = new Image();
    im.src = visible[i].dataset.full;
  }

  function paint(i, animate) {
    idx = (i + visible.length) % visible.length;
    var t = visible[idx];

    lbImg.classList.remove('is-ready');
    var next = new Image();
    next.onload = function () {
      lbImg.src = next.src;
      lbImg.alt = t.dataset.title || '';
      lbImg.classList.add('is-ready');
    };
    next.src = t.dataset.full;
    if (next.complete) next.onload();

    lbTitle.textContent = t.dataset.title || '';
    lbGenre.textContent = t.dataset.cap || '';
    lbCount.textContent = (idx + 1) + ' / ' + visible.length;

    $$('img', lbStrip).forEach(function (th, n) {
      th.classList.toggle('is-active', n === idx);
      if (n === idx && animate !== false) {
        th.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
      }
    });

    preload(idx + 1);
    preload(idx - 1);
  }

  function buildStrip() {
    lbStrip.innerHTML = '';
    visible.forEach(function (t, n) {
      var th = document.createElement('img');
      th.src = t.querySelector('img').getAttribute('src');
      th.alt = '';
      th.loading = 'lazy';
      th.addEventListener('click', function () { paint(n); });
      lbStrip.appendChild(th);
    });
  }

  function open(i) {
    lastFocus = document.activeElement;
    buildStrip();
    lb.hidden = false;
    // reflow, чтобы сработал transition
    void lb.offsetWidth;
    lb.classList.add('is-open');
    document.body.classList.add('is-locked');
    paint(i, false);
    $('#lbClose').focus();
  }

  function close() {
    lb.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    window.setTimeout(function () {
      lb.hidden = true;
      lbImg.removeAttribute('src');
    }, 450);
    if (lastFocus) lastFocus.focus();
  }

  grid.addEventListener('click', function (e) {
    var t = e.target.closest('.tile');
    if (!t || t.classList.contains('is-hidden')) return;
    open(visible.indexOf(t));
  });
  grid.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var t = e.target.closest('.tile');
    if (!t) return;
    e.preventDefault();
    open(visible.indexOf(t));
  });

  $('#lbClose').addEventListener('click', close);
  $('#lbPrev').addEventListener('click', function () { paint(idx - 1); });
  $('#lbNext').addEventListener('click', function () { paint(idx + 1); });
  $('#lbStage').addEventListener('click', function (e) {
    if (e.target === e.currentTarget) close();
  });

  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape')     { close(); }
    if (e.key === 'ArrowLeft')  { paint(idx - 1); }
    if (e.key === 'ArrowRight') { paint(idx + 1); }
  });

  /* --- свайп --- */
  var sx = 0, sy = 0, tracking = false;
  var stage = $('#lbStage');
  stage.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
  }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (!tracking) return;
    tracking = false;
    var dx = e.changedTouches[0].clientX - sx;
    var dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) paint(idx + (dx < 0 ? 1 : -1));
    else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) close();
  }, { passive: true });

  /* --- год в подвале --- */
  var yr = $('#yr');
  if (yr) yr.textContent = String(new Date().getFullYear());
})();
