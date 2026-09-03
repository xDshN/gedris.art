/* =========================================================================
   Мария Курочкина — фотограф. Поведение страницы.
   Ванильный JS, без зависимостей.
   ========================================================================= */
(function () {
  'use strict';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = mqReduced.matches;
  mqReduced.addEventListener('change', function (e) { reduced = e.matches; });

  var clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };

  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }

  /* ================================================== загрузчик */
  // Показываем страницу, когда шрифты и первый экран готовы, но не раньше
  // чем через 1.1 с — иначе вступление мелькает и читается как глюк.
  var MIN_BOOT = 1100, MAX_BOOT = 3200;
  var bootStart = performance.now();
  var booted = false;

  // Сценарий вступления. Всё в одном месте, чтобы тайминги было легко крутить.
  var STINGER = {
    hold:   450,    // пауза после загрузчика, пустой кадр
    frame:  520,    // рисуется видоискатель
    zoom:   2.6,    // насколько объектив крупнее в начале отъезда
    curve:  'cubic-bezier(.215,.61,.355,1)',   // мягкая посадка, как у механики
    rack:   1550,   // отъезд трансфокатором
    lock:   320,    // автофокус поймал, до затвора
    shut:   75      // сам затвор
  };

  // Отъезд считаем сами: масштаб и расфокус связаны одной кривой, поэтому
  // растянутый кадр не успевает показать свои пиксели — резкость приходит
  // ровно тогда, когда масштаб доходит до единицы.
  function easeOut(u) { return 1 - Math.pow(1 - u, 3); }

  // Реквизит грузим после отъезда: декодирование тринадцати картинок
  // шло параллельно с расфокусом и съедало кадры на самом дорогом участке.
  function loadProps() {
    $$('.prop').forEach(function (el) {
      if (el.dataset.src) { el.src = el.dataset.src; delete el.dataset.src; }
    });
  }

  function scatterProps() {
    var frame = $('.frame'), cam = $('.cam-wrap');
    if (!frame || !cam) return;
    var cr = cam.getBoundingClientRect();
    // предметы вылетают из-за корпуса: сдвиг до его центра считаем по факту,
    // чтобы точка вылета совпадала при любой ширине окна
    var cx = cr.left + cr.width * 0.42, cy = cr.top + cr.height * 0.55;
    $$('.prop', frame).forEach(function (el, i) {
      var r = el.getBoundingClientRect();
      var dx = cx - (r.left + r.width / 2);
      var dy = cy - (r.top + r.height / 2);
      var rot = ((i % 2) ? 1 : -1) * (3 + (i * 37) % 8);   // поворот раздувает габарит — держим умеренным
      var delay = 40 + i * 72;   // разводим по времени: меньше слоёв едет одновременно
      el.style.transition = 'none';
      el.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(.16) rotate(' + (rot * 2.4) + 'deg)';
      el.style.opacity = '0';
      void el.offsetWidth;
      el.style.transition = 'transform 1150ms cubic-bezier(.18,.72,.3,1) ' + delay + 'ms, opacity 420ms linear ' + delay + 'ms';
      el.style.transform = 'translate(0,0) scale(1) rotate(' + rot + 'deg)';
      el.style.opacity = '1';
      setTimeout(function () { el.classList.add('is-landed'); }, delay + 1200);
    });
  }

  function runIntro() {
    var cam = $('.cam-wrap'), sharp = $('.cam'), name = $('#heroName');
    var focal = $('#vfFocal'), shut = $('#shutter');
    var body = document.body;
    if (!cam || !name) { body.classList.add('is-lit', 'is-flown'); return; }

    // Имя — самый дорогой слой на странице: крупный текст с градиентом
    // по маске. Размытие пересобирает его целиком, поэтому на отъезде
    // имя просто спрятано, а расфокус живёт только те 900мс, пока
    // наводится резкость. С постоянным размытием кадр стоил 50мс вместо 17.
    var blurPx = Math.round(window.innerWidth * 0.011) + 'px';
    name.style.opacity = '0';

    body.classList.add('is-framing');

    setTimeout(function () {
      cam.style.transform = 'scale(' + STINGER.zoom + ')';
      cam.style.transition = 'opacity 520ms linear';
      cam.style.opacity = '1';

      setTimeout(function () {
        // Отъезд и наводку отдаём Web Animations: обе идут на композиторе.
        // Прошлый вариант писал transform из rAF каждый кадр — это главная
        // причина, по которой кадр вырос с 17 до 50мс против пролёта.
        var opts = { duration: STINGER.rack, easing: STINGER.curve, fill: 'forwards' };
        var move = cam.animate(
          [{ transform: 'scale(' + STINGER.zoom + ')' }, { transform: 'scale(1)' }], opts);
        if (sharp) {
          sharp.animate([
            { opacity: 0, offset: 0 },
            { opacity: .22, offset: .55 },
            { opacity: 1, offset: 1 }
          ], { duration: STINGER.rack, easing: 'linear', fill: 'forwards' });
        }

        // Счётчик миллиметров обновляем редко: шестьдесят перерисовок
        // текста в секунду никто не читает, а кадры они забирают.
        var t0 = performance.now(), last = -1;
        (function tick(t) {
          var u = clamp((t - t0) / STINGER.rack, 0, 1);
          if (focal && t - last > 90) {
            focal.textContent = Math.round(70 + (24 - 70) * easeOut(u));
            last = t;
          }
          if (u < 1) requestAnimationFrame(tick);
          else if (focal) focal.textContent = '24';
        })(t0);

        if (move && move.finished) {
          move.finished.catch(function () {}).then(function () {
            cam.style.transform = 'scale(1)';
            if (sharp) sharp.style.opacity = '1';
            afterRack();
          });
        } else {
          setTimeout(afterRack, STINGER.rack);
        }
      }, 300);
    }, STINGER.frame);

    function afterRack() {
      body.classList.add('is-locked');
      loadProps();
      setTimeout(function () {
        if (shut) { shut.style.transition = 'opacity 55ms linear'; shut.style.opacity = '1'; }
        setTimeout(function () {
          body.classList.add('is-lit');
          body.classList.remove('is-framing', 'is-locked');
          if (shut) { shut.style.transition = 'opacity 210ms linear'; shut.style.opacity = '0'; }
          // имя проявляется резкостью — тем же движением, что и камера
          name.style.willChange = 'filter, opacity';
          name.style.transition = 'none';
          name.style.filter = 'blur(' + blurPx + ')';
          name.style.opacity = '.12';
          void name.offsetWidth;
          name.style.transition = 'filter 900ms cubic-bezier(.4,0,.2,1), opacity 820ms linear';
          name.style.filter = 'blur(0px)';
          name.style.opacity = '1';
          // снимаем подготовку слоя, чтобы имя не держало отдельный буфер
          setTimeout(function () { name.style.willChange = ''; name.style.filter = ''; }, 1000);

          setTimeout(function () { body.classList.add('is-flown'); }, 260);
          setTimeout(function () { body.classList.add('is-clouded'); }, 460);
          // разлёт после того, как имя навелось: два дорогих участка
          // не должны накладываться друг на друга
          setTimeout(scatterProps, 1000);
        }, STINGER.shut);
      }, STINGER.lock);
    }
  }

  // Без анимации всё сразу на местах: интро — украшение, а не условие показа.
  function settleAtOnce() {
    var body = document.body;
    loadProps();
    body.classList.add('is-lit', 'is-flown', 'is-clouded');
    var cam = $('.cam-wrap');
    if (cam) { cam.style.opacity = '1'; cam.style.transform = 'none'; }
    var sh = $('.cam'); if (sh) sh.style.opacity = '1';
    var name = $('#heroName');
    if (name) { name.style.filter = 'none'; name.style.opacity = '1'; }
    $$('.prop').forEach(function (el) {
      el.style.opacity = '1'; el.style.transform = 'none'; el.classList.add('is-landed');
    });
  }

  function playStinger() {
    if (reduced) { settleAtOnce(); return; }
    setTimeout(runIntro, STINGER.hold);
  }

  function boot() {
    if (booted) return;
    booted = true;
    var left = Math.max(0, MIN_BOOT - (performance.now() - bootStart));
    setTimeout(function () {
      fitName();
      document.body.classList.add('is-ready');
      playStinger();
      setTimeout(function () {
        var el = $('#boot');
        if (el) el.remove();
      }, 900);
    }, left);
  }

  var ready = [];
  if (document.fonts && document.fonts.ready) ready.push(document.fonts.ready);
  ready.push(new Promise(function (res) {
    if (document.readyState === 'complete') res();
    else window.addEventListener('load', res, { once: true });
  }));
  Promise.all(ready).then(boot).catch(boot);
  setTimeout(boot, MAX_BOOT);

  /* ================================================== шапка и прогресс */
  var hdr = $('#hdr');
  var progressBar = $('#progress i');
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY;
      hdr.classList.toggle('is-stuck', y > 40);

      if (progressBar) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        progressBar.style.transform = 'scaleX(' + (max > 0 ? clamp(y / max, 0, 1) : 0) + ')';
      }
      moveBackground(y);
      ticking = false;
    });
  }
  /* --- общий фон: пятна плывут с разной скоростью --- */
  var orbs = $$('.bg-orb');
  var arc  = $('.bg-arc');
  var streaks = $$('.bg-streak');
  var bgGrid = $('.bg-grid');
  var bgEl = $('#bg');
  var worksEl = $('#works');
  // скорость и стартовая высота каждого пятна (в долях экрана)
  var ORB = [
    { k: 0.18, y: -0.30 }, { k: 0.34, y: 0.10 }, { k: 0.11, y: -0.20 },
    { k: 0.26, y: 0.90 },  { k: 0.42, y: 1.50 }, { k: 0.15, y: 2.00 }
  ];
  var WRAP = 2.8, LOW = -0.9;   // окно, по которому пятна ходят по кругу

  var lastBgY = null;

  function moveBackground(y) {
    var vh = window.innerHeight;
    if (reduced) { if (bgEl) bgEl.style.setProperty('--oi', '0.4'); return; }
    // пересчитываем только при заметном сдвиге — иначе лишние перерисовки
    if (lastBgY !== null && Math.abs(y - lastBgY) < 6) return;
    lastBgY = y;
    var range = WRAP * vh, low = LOW * vh;
    for (var i = 0; i < orbs.length; i++) {
      if (orbs[i].offsetParent === null) continue;
      var o = ORB[i % ORB.length];
      // зацикливаем: иначе на длинной странице пятна уезжают вверх
      // и низ остаётся без цвета
      var pos = o.y * vh - y * o.k;
      pos = ((pos - low) % range + range) % range + low;
      var drift = Math.sin((y * 0.0011) + i * 1.7) * 34;
      orbs[i].style.transform = 'translate3d(' + drift.toFixed(1) + 'px,' + pos.toFixed(1) + 'px,0)';
    }
    // полосы идут через страницу медленнее пятен и слегка качаются
    for (var j = 0; j < streaks.length; j++) {
      var sp = 0.24;
      var sy = 0.36 * vh - y * sp;
      sy = ((sy - low) % range + range) % range + low;
      var tilt = -21 + Math.sin(y * 0.0006 + j) * 2.4;
      streaks[j].style.transform = 'translate3d(0,' + sy.toFixed(1) + 'px,0) rotate(' + tilt.toFixed(2) + 'deg)';
    }

    if (arc)   arc.style.translate = '0 ' + (-y * 0.07).toFixed(1) + 'px';
    if (bgGrid) bgGrid.style.transform = 'translate3d(0,' + (-y * 0.05).toFixed(1) + 'px,0)';

    // Фон приглушается ровно настолько, насколько экран занят галереей:
    // привязка к самой секции надёжнее доли прокрутки, которая плывёт
    // из-за ленивой подгрузки кадров.
    var oi = 0.42;
    if (worksEl) {
      var r = worksEl.getBoundingClientRect();
      var seen = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / vh;
      oi = 0.42 - 0.24 * Math.min(1, seen * 1.2);
    }
    bgEl.style.setProperty('--oi', oi.toFixed(3));
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ================================================== мобильное меню */
  var navToggle = $('#navToggle');
  var nav = $('#nav');

  function closeNav() {
    nav.classList.remove('is-open');
    navToggle.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('is-locked');
  }
  navToggle.addEventListener('click', function () {
    var open = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    navToggle.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('is-locked', open);
  });
  $$('#nav a').forEach(function (a) { a.addEventListener('click', closeNav); });

  /* ================================================== появление блоков */
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

  /* ================================================== выключка имени */
  var heroName = $('#heroName');

  function fitName() {
    if (!heroName) return;
    var box = heroName.clientWidth;
    var lines = $$('.ln', heroName);
    if (!box || !lines.length) return;

    // Пока по кеглю или трекингу идёт переход, getComputedStyle отдаёт
    // промежуточное значение, а не то, к которому мы только что перешли.
    // Мерить по нему нельзя: подгонка начнёт считать от собственного
    // прошлого результата. Поэтому любой начатый переход досматриваем
    // до конца — значение сразу становится итоговым.
    function settle(el) {
      if (!el.getAnimations) return;
      el.getAnimations().forEach(function (a) {
        if (a.transitionProperty !== undefined) { try { a.finish(); } catch (e) {} }
      });
    }

    function clear() {
      heroName.style.fontSize = '';
      lines.forEach(function (l) {
        l.style.letterSpacing = '';
        if (l.firstElementChild) l.firstElementChild.style.marginRight = '';
      });
      settle(heroName);
      lines.forEach(function (l) {
        settle(l);
        if (l.firstElementChild) settle(l.firstElementChild);
      });
    }

    // Ширину букв меряем при нулевом трекинге: тогда она зависит только
    // от кегля, и дальше всё считается формулой, без подгонки в цикле.
    clear();
    lines.forEach(function (l) { l.style.letterSpacing = '0px'; settle(l); });

    var base = parseFloat(getComputedStyle(heroName).fontSize);
    var nat = lines.map(function (l) {
      return l.firstElementChild ? l.firstElementChild.getBoundingClientRect().width : 0;
    });
    var widest = Math.max.apply(null, nat);
    // Пока шрифт не встал или блок скрыт, мерить нечего: возвращаем
    // разметку к тому, что задаёт CSS, и ждём следующего вызова.
    if (!(widest > 0) || !(base > 0)) { clear(); return; }

    // Потолок считаем от реального остатка места на первом экране,
    // а не от доли высоты окна: имя занимает всё, что не заняли
    // надзаголовок, подпись и нижняя строка.
    var heroEl = heroName.closest('.hero');
    var wrap = heroName.parentElement;
    var capSize = Infinity;
    if (heroEl && wrap) {
      var cs = getComputedStyle(heroEl);
      var vh = Math.min(heroEl.clientHeight, window.innerHeight);
      var inner = vh - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      var others = wrap.getBoundingClientRect().height - heroName.getBoundingClientRect().height;
      var avail = (inner - others) * 0.97;
      var lh = parseFloat(getComputedStyle(lines[0]).lineHeight) / parseFloat(getComputedStyle(lines[0]).fontSize) || 0.82;
      if (avail > 0) capSize = avail / (lines.length * lh);
    }

    // Самая длинная строка заполняет блок целиком, если хватает высоты.
    var size = Math.min(base * (box / widest), capSize);
    if (!isFinite(size) || size <= 0) { clear(); return; }
    heroName.style.fontSize = size + 'px';
    settle(heroName);

    // После смены кегля перемеряем: округление глифов не строго линейно,
    // и один корректирующий проход возвращает строку точно в ширину блока.
    function remeasure() {
      nat = lines.map(function (l) {
        return l.firstElementChild ? l.firstElementChild.getBoundingClientRect().width : 0;
      });
      widest = Math.max.apply(null, nat);
    }
    remeasure();
    if (!(widest > 0)) { clear(); return; }
    if (Math.abs(widest - box) > 0.5 && size < capSize - 0.5) {
      size = Math.min(size * (box / widest), capSize);
      heroName.style.fontSize = size + 'px';
      settle(heroName);
      remeasure();
      if (!(widest > 0)) { clear(); return; }
    }

    // Куда тянемся: полная ширина блока либо столько, сколько даёт кегль.
    var targetW = Math.min(box, widest);

    // Короткие строки догоняем трекингом — кегль у всех остаётся общим.
    // Ширина строки линейна по трекингу: ink = nat + ls * (букв - 1),
    // потому что хвост после последней буквы снимаем отрицательным
    // полем. Значит нужное значение берётся сразу, одной формулой.
    // Прошлый вариант подбирал его итерациями от замера бокса — и когда
    // бокс схлопывался в ноль, подбор расходился: трекинг улетал в минус
    // на тысячи пикселей, имя складывалось в одну букву, а следующие
    // вызовы уже видели нулевую ширину и выходили, не починив.
    lines.forEach(function (l, k) {
      var inner = l.firstElementChild;
      if (!inner) return;
      var chars = inner.textContent.trim().length;
      if (chars < 2) return;
      var ls = (targetW - nat[k]) / (chars - 1);
      // разумные пределы: имя не растягиваем в разрядку и не слипаем
      ls = clamp(ls, -0.12 * size, 0.6 * size);
      l.style.letterSpacing = ls + 'px';
      inner.style.marginRight = (-ls) + 'px';
    });
  }

  fitName();
  window.addEventListener('resize', debounce(fitName, 120));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitName);
  window.addEventListener('load', fitName);

  /* ================================================== свет за курсором */
  var hero = $('.hero');
  var pLight = $('#pointerLight');
  if (hero && pLight && window.matchMedia('(hover: hover)').matches) {
    var lx = 0, ly = 0, tx = 0, ty = 0, raf = null;
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      if (!raf) raf = requestAnimationFrame(follow);
    });
    function follow() {
      lx += (tx - lx) * 0.12;
      ly += (ty - ly) * 0.12;
      pLight.style.transform = 'translate3d(' + lx + 'px,' + ly + 'px,0)';
      raf = (Math.abs(tx - lx) > 0.5 || Math.abs(ty - ly) > 0.5) ? requestAnimationFrame(follow) : null;
    }
  }

  /* ================================================== бегущая строка */
  var track = $('#tickerTrack');
  if (track) {
    var names = $$('.exp-name').map(function (el) { return el.textContent.trim(); });
    if (names.length) {
      var seq = names.map(function (n) {
        return '<span>' + n + '</span><em></em>';
      }).join('');
      track.innerHTML = '<div class="ticker-seq">' + seq + '</div>' +
                        '<div class="ticker-seq">' + seq + '</div>';
    } else {
      track.closest('.ticker').hidden = true;
    }
  }

  /* ================================================== счётчики */
  var stats = $('#stats');
  if (stats && 'IntersectionObserver' in window) {
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        sio.unobserve(e.target);
        $$('b', e.target).forEach(function (b, i) {
          var to = parseInt(b.dataset.to, 10) || 0;
          b.style.setProperty('--bp', (i * 26) + '%');
          if (reduced) { b.textContent = to; return; }
          var dur = 1100 + i * 90, t0 = null;
          (function step(t) {
            if (t0 === null) t0 = t;
            var k = clamp((t - t0) / dur, 0, 1);
            b.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
            if (k < 1) requestAnimationFrame(step);
          })(performance.now());
        });
      });
    }, { threshold: 0.4 });
    sio.observe(stats);
  }

  /* ================================================== активный пункт меню */
  var navLinks = $$('#nav a');
  var sections = navLinks.map(function (a) { return $(a.getAttribute('href')); }).filter(Boolean);
  if (sections.length && 'IntersectionObserver' in window) {
    var seen = {};
    var nio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { seen[e.target.id] = e.intersectionRatio; });
      var best = null, bestR = 0;
      Object.keys(seen).forEach(function (id) {
        if (seen[id] > bestR) { bestR = seen[id]; best = id; }
      });
      navLinks.forEach(function (a) {
        a.classList.toggle('is-active', best !== null && a.getAttribute('href') === '#' + best);
      });
    }, { threshold: [0, 0.15, 0.4, 0.75], rootMargin: '-84px 0px -40% 0px' });
    sections.forEach(function (s) { nio.observe(s); });
  }

  /* ================================================================ ГАЛЕРЕЯ */
  var grid = $('#grid');
  if (!grid) return;

  var tiles    = $$('.tile', grid);
  var filters  = $$('#filters button');
  var moreWrap = $('#gridMore');
  var moreBtn  = $('#moreBtn');
  var moreNum  = $('#moreCount');
  var status   = $('#gridStatus');
  var PAGE     = 18;

  var current = 'all';
  var shown   = PAGE;
  var visible = [];

  function matches(t) { return current === 'all' || t.dataset.genre === current; }

  function render(announce) {
    visible = tiles.filter(matches);

    tiles.forEach(function (t) { t.classList.add('is-hidden'); });
    // Восемь вариантов появления раздаются не по кругу, а по таблице,
    // чтобы соседние карточки не повторяли друг друга.
    var ANIM = [1, 5, 3, 7, 2, 6, 4, 8, 3, 1, 8, 5, 6, 2, 7, 4];

    visible.forEach(function (t, i) {
      t.dataset.idx = String(i);
      if (i < shown) {
        if (!t.dataset.anim) {
          t.dataset.anim = String(ANIM[i % ANIM.length]);
          t.style.setProperty('--d', ((i % 3) * 90) + 'ms');
        }
        t.classList.remove('is-hidden');
        if (reduced || !io) t.classList.add('is-in');
        else if (!t.classList.contains('is-in')) io.observe(t);
      }
    });

    var rest = visible.length - shown;
    if (rest > 0) {
      moreWrap.hidden = false;
      moreNum.textContent = Math.min(rest, PAGE);
    } else {
      moreWrap.hidden = true;
      moreNum.textContent = '';
    }

    layoutGrid();

    if (announce && status) {
      status.textContent = 'Показано ' + Math.min(shown, visible.length) +
                           ' из ' + visible.length + ' кадров';
    }
  }

  /* --- выкладка рядов: подбираем высоту строки под точные пропорции --- */
  var MOBILE = window.matchMedia('(max-width: 620px)');

  function layoutGrid() {
    var items = visible.slice(0, shown);
    if (!items.length) return;

    if (MOBILE.matches) {
      items.forEach(function (t) { t.style.width = ''; t.style.height = ''; });
      return;
    }

    // полпикселя запаса: без него сумма ряда изредка перекрывает ширину
    // на доли пикселя и последний кадр переносится на новую строку
    var W = grid.getBoundingClientRect().width - 0.5;
    var gap = parseFloat(getComputedStyle(grid).columnGap) || 12;
    var probe = $('#rowProbe');
    var target = (probe && probe.getBoundingClientRect().height) || 320;
    if (!(W > 0)) return;

    var ar = function (t) { return parseFloat(t.dataset.ar) || 1.5; };
    var availOf = function (n) { return W - gap * (n - 1); };

    // жадно набираем строку, пока её высота не опустится до целевой
    var rows = [], row = [], sum = 0;
    items.forEach(function (t) {
      row.push(t);
      sum += ar(t);
      if (availOf(row.length) / sum <= target) { rows.push(row); row = []; sum = 0; }
    });
    if (row.length) rows.push(row);

    var heightOf = function (r) {
      var s2 = 0;
      r.forEach(function (t) { s2 += ar(t); });
      return availOf(r.length) / s2;
    };

    // последняя строка тоже заполняет ширину; если для этого пришлось бы
    // раздуть её выше меры — забираем кадры из предыдущей строки
    if (rows.length > 1) {
      var last = rows[rows.length - 1], prev = rows[rows.length - 2];
      var guard = 0;
      while (heightOf(last) > target * 1.75 && prev.length > 1 && guard++ < 12) {
        last.unshift(prev.pop());
      }
    }

    rows.forEach(function (r) {
      var h = heightOf(r);
      var avail = availOf(r.length);
      var used = 0;
      r.forEach(function (t, i) {
        // остаток отдаём последнему, чтобы не копилась ошибка округления
        var w = (i === r.length - 1) ? (avail - used) : Math.round(ar(t) * h * 100) / 100;
        used += w;
        t.style.width = w.toFixed(2) + 'px';
        t.style.height = h.toFixed(2) + 'px';
      });
    });
  }

  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.getAttribute('aria-selected') === 'true') return;
      filters.forEach(function (b) { b.setAttribute('aria-selected', 'false'); });
      btn.setAttribute('aria-selected', 'true');
      current = btn.dataset.genre;
      shown = PAGE;
      render(true);
      var anchor = $('#filters');
      var top = anchor.getBoundingClientRect().top + window.scrollY - 96;
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
    });
  });

  moreBtn.addEventListener('click', function () {
    shown += PAGE;
    render(true);
    if (moreWrap.hidden) moreBtn.blur();
  });

  render(false);

  /* --- свет под курсором: плитки, чипсы, кнопки --- */
  if (window.matchMedia('(hover: hover)').matches) {
    document.addEventListener('pointermove', function (e) {
      var el = e.target.closest('.tile-media, .filters button, .btn');
      if (!el) return;
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
    }, { passive: true });
  }

  /* ====================================================== ПОЛНОЭКРАННЫЙ ВИД */
  var lb      = $('#lb');
  var lbImg   = $('#lbImg');
  var lbTitle = $('#lbTitle');
  var lbGenre = $('#lbGenre');
  var lbCount = $('#lbCount');
  var lbStrip = $('#lbStrip');
  var lbStage = $('#lbStage');
  var lbSpin  = $('#lbSpin');
  var lbHint  = $('#lbHint');
  var zoomVal = $('#lbZoomVal');
  var btnIn   = $('#lbIn');
  var btnOut  = $('#lbOut');

  var idx = 0;
  var lastFocus = null;
  var MIN = 1, MAX = 6;
  var scale = 1, ox = 0, oy = 0;   // масштаб и смещение
  var instantT = null;

  /* --- трансформация --- */
  function limits() {
    // сколько пикселей можно увести кадр, чтобы он не отрывался от сцены
    var sw = lbStage.clientWidth, sh = lbStage.clientHeight;
    var w = lbImg.clientWidth * scale, h = lbImg.clientHeight * scale;
    return { x: Math.max(0, (w - sw) / 2), y: Math.max(0, (h - sh) / 2) };
  }

  function apply() {
    var l = limits();
    ox = clamp(ox, -l.x, l.x);
    oy = clamp(oy, -l.y, l.y);
    lbImg.style.transform = 'translate3d(' + ox + 'px,' + oy + 'px,0) scale(' + scale + ')';
    var zoomed = scale > 1.001;
    lbImg.classList.toggle('is-zoomed', zoomed);
    lb.classList.toggle('is-zoomed', zoomed);
    zoomVal.textContent = Math.round(scale * 100) + '%';
    btnIn.disabled  = scale >= MAX - 0.001;
    btnOut.disabled = scale <= MIN + 0.001;
    if (lbHint) lbHint.classList.toggle('is-off', zoomed);
  }

  function instant(on) {
    lbImg.classList.toggle('is-panning', on);
    if (on) {
      clearTimeout(instantT);
      instantT = setTimeout(function () {
        if (!panFrom && !pts.size) lbImg.classList.remove('is-panning');
      }, 150);
    }
  }

  function resetZoom() { scale = 1; ox = 0; oy = 0; apply(); }

  /* приближение к точке: точка под курсором остаётся на месте */
  function zoomAt(next, cx, cy) {
    next = clamp(next, MIN, MAX);
    if (Math.abs(next - scale) < 0.0005) return;
    if (cx === undefined) { cx = null; }
    if (cx !== null) {
      var r = lbImg.getBoundingClientRect();
      var dx = cx - (r.left + r.width / 2);
      var dy = cy - (r.top + r.height / 2);
      var k = next / scale;
      ox -= dx * (k - 1);
      oy -= dy * (k - 1);
    }
    scale = next;
    if (scale <= MIN + 0.001) { ox = 0; oy = 0; }
    apply();
  }

  /* --- показ кадра --- */
  function preload(i) {
    if (i < 0 || i >= visible.length) return;
    var im = new Image();
    im.src = visible[i].dataset.full;
  }

  function paint(i, scroll) {
    if (!visible.length) return;
    idx = (i + visible.length) % visible.length;
    var t = visible[idx];

    resetZoom();
    lbImg.classList.remove('is-ready');
    lbSpin.classList.add('is-on');

    var next = new Image();
    next.decoding = 'async';
    var done = function () {
      lbImg.src = next.src;
      lbImg.alt = (t.dataset.title || '') + ' — ' + (t.dataset.cap || '');
      lbImg.classList.add('is-ready');
      lbSpin.classList.remove('is-on');
      resetZoom();
    };
    next.onload = done;
    next.onerror = function () {
      lbSpin.classList.remove('is-on');
      lbImg.src = t.querySelector('img').getAttribute('src');
      lbImg.classList.add('is-ready');
    };
    next.src = t.dataset.full;
    if (next.complete) done();

    lbTitle.textContent = t.dataset.title || '';
    lbGenre.textContent = t.dataset.cap || '';
    lbCount.textContent = (idx + 1) + ' / ' + visible.length;

    $$('img', lbStrip).forEach(function (th, n) {
      var on = n === idx;
      th.classList.toggle('is-active', on);
      th.setAttribute('aria-selected', String(on));
      th.tabIndex = on ? 0 : -1;
      if (on && scroll !== false) {
        th.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
      }
    });

    preload(idx + 1);
    preload(idx - 1);
  }

  function buildStrip() {
    lbStrip.innerHTML = '';
    var frag = document.createDocumentFragment();
    visible.forEach(function (t, n) {
      var th = document.createElement('img');
      th.src = t.querySelector('img').getAttribute('src');
      th.alt = t.dataset.title || '';
      th.loading = 'lazy';
      th.setAttribute('role', 'tab');
      th.tabIndex = n === idx ? 0 : -1;
      th.addEventListener('click', function () { paint(n); });
      th.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); paint(n); }
      });
      frag.appendChild(th);
    });
    lbStrip.appendChild(frag);
  }

  /* --- открытие и закрытие --- */
  var FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

  function open(i) {
    if (i < 0) return;
    lastFocus = document.activeElement;
    buildStrip();
    lb.hidden = false;
    void lb.offsetWidth;
    lb.classList.add('is-open');
    document.body.classList.add('is-locked');
    paint(i, false);
    $('#lbClose').focus();
  }

  function close() {
    lb.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    setTimeout(function () {
      lb.hidden = true;
      lbImg.removeAttribute('src');
      resetZoom();
    }, 420);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
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
  btnIn.addEventListener('click', function () { zoomAt(scale * 1.6, null); });
  btnOut.addEventListener('click', function () { zoomAt(scale / 1.6, null); });
  zoomVal.addEventListener('click', resetZoom);

  /* двойной клик — приблизить/вернуть */
  lbImg.addEventListener('dblclick', function (e) {
    e.preventDefault();
    zoomAt(scale > 1.001 ? MIN : 2.6, e.clientX, e.clientY);
  });

  /* Колесо намеренно не масштабирует: на тачпадах и мышах с инерцией
     это работает рывками. Масштаб — кнопками, двойным кликом и щипком. */

  /* --- указатели: панорама, свайп, щипок --- */
  var pts = new Map();
  var startDist = 0, startScale = 1, startMid = null;
  var panFrom = null, swipeFrom = null;
  var downTarget = null, moved = 0;

  lbStage.addEventListener('pointerdown', function (e) {
    if (lb.hidden) return;
    if (e.target.closest('.lb-nav')) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { downTarget = e.target; moved = 0; }
    try { lbStage.setPointerCapture(e.pointerId); } catch (err) {}

    if (pts.size === 2) {
      var a = Array.from(pts.values());
      startDist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      startScale = scale;
      startMid = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 };
      panFrom = swipeFrom = null;
    } else if (pts.size === 1) {
      if (scale > 1.001) {
        panFrom = { x: e.clientX, y: e.clientY, ox: ox, oy: oy };
        lbImg.classList.add('is-panning');
      } else {
        swipeFrom = { x: e.clientX, y: e.clientY, t: Date.now() };
      }
    }
  });

  lbStage.addEventListener('pointermove', function (e) {
    if (!pts.has(e.pointerId)) return;
    var prev = pts.get(e.pointerId);
    moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pts.size === 2 && startDist) {
      var a = Array.from(pts.values());
      var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      instant(true);
      zoomAt(startScale * (d / startDist), startMid.x, startMid.y);
    } else if (panFrom) {
      ox = panFrom.ox + (e.clientX - panFrom.x);
      oy = panFrom.oy + (e.clientY - panFrom.y);
      apply();
    }
  });

  function endPointer(e) {
    if (!pts.has(e.pointerId)) return;
    var p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    try { lbStage.releasePointerCapture(e.pointerId); } catch (err) {}

    if (panFrom && pts.size === 0) {
      panFrom = null;
      lbImg.classList.remove('is-panning');
    }
    if (pts.size < 2) { startDist = 0; startMid = null; }

    if (swipeFrom && pts.size === 0) {
      var dx = p.x - swipeFrom.x;
      var dy = p.y - swipeFrom.y;
      var dt = Date.now() - swipeFrom.t;
      swipeFrom = null;
      if (scale <= 1.001 && dt < 800) {
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) { paint(idx + (dx < 0 ? 1 : -1)); moved = 999; }
        else if (dy > 110 && Math.abs(dy) > Math.abs(dx)) { close(); moved = 999; }
      }
    }

    // Закрытие по фону считаем здесь, а не по click: setPointerCapture
    // переадресует click на сцену, и клик по самому кадру тоже закрывал окно.
    if (pts.size === 0) {
      if (downTarget === lbStage && moved < 6 && scale <= 1.001) close();
      downTarget = null;
    }
  }
  lbStage.addEventListener('pointerup', endPointer);
  lbStage.addEventListener('pointercancel', endPointer);

  /* --- клавиатура и ловушка фокуса --- */
  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;

    if (e.key === 'Escape')     { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); paint(idx - 1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); paint(idx + 1); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(scale * 1.5, null); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(scale / 1.5, null); return; }
    if (e.key === '0')          { e.preventDefault(); resetZoom(); return; }

    if (e.key === 'Tab') {
      var f = $$(FOCUSABLE, lb).filter(function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      // фокус мог уйти наружу (например, кнопка стала недоступной) — возвращаем
      if (!lb.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  window.addEventListener('resize', debounce(function () {
    layoutGrid();
    if (!lb.hidden) apply();
  }, 120));
  if (MOBILE.addEventListener) MOBILE.addEventListener('change', layoutGrid);

  /* --- год в подвале --- */
  var yr = $('#yr');
  if (yr) yr.textContent = String(new Date().getFullYear());
})();
