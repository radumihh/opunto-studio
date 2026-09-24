/* ---------------------------------------------------------------
   THE PROJECT PAGE — any card in the portfolio strip, in any of the
   three sets, opens its project full screen.

   HOW IT IS WIRED, AND WHY IT TOUCHES NOTHING ELSE.
   It keeps its own record of which card was pressed, and it takes the
   wheel, the keys and the drags in the CAPTURE phase on window while it
   is open — so the room's own smoother, the reel's sideways wheel and
   the hero's pin never hear them, without a line in any of those files
   having to know this page exists.

   WHAT IT DOES.
     open     the pressed card's frame becomes the page: the sheet is
              clipped from that card's rectangle out to the window
     scroll   one eased position, frame-rate independent, carried by a
              transform on the track. Every block's place on the screen
              is its layout offset minus that position, so nothing is
              measured per frame
     arrive   every block plays its own entrance once, as it comes on
              screen
     colour   every picture is grey until it crosses into the right of
              the window, derived from the position
     onward   the sheets of one set are one continuous run, in the order
              the strip shows them. Past the end of a sheet the next
              project follows: what is on the left goes, the name at the
              foot rises into the title, the new photographs arrive from
              the right. Past the start, all of it runs the other way.
              Past either end of the SET, the page folds back into the
              strip it was opened from.
     close    Esc or the close in the bar; the sheet folds back into the
              card of the project on screen

   WHY THE TURN IS SMOOTH — three sheets, and nothing built while moving.
   A sheet is one project laid out in its own view. The page keeps the
   one on screen and, once it is idle, builds the two either side of it,
   parked at the place a turn lands on — the next one at its start, the
   previous one at its end — with the first photographs decoded. A turn
   then only moves things that already exist: two views and their masks
   and one line of type, all transforms. The sheet that is left becomes
   the neighbour on the other side as it is, so going back and forth
   builds nothing at all.
   --------------------------------------------------------------- */
/* ADAPTED FOR OPUNTO STUDIO. This is zx-final/js/project-page.js, the
   site's own project page, changed only where marked ADAPTED:
     - projects come from the database (window.__ppSetProjects) instead of
       project-data.js, and a card names its project by data-pid instead of
       by the folder in its image URL;
     - texts, materials and the wider gaps come from the project's own
       fields (texts[].afterPhoto, materials.afterPhoto, photos[].spaced),
       with the site's automatic placement when they are left empty;
     - no sample copy and no placeholder materials: a block with nothing
       in it is left out;
     - window.__ppRefresh re-renders the open project in place for the
       live preview, and window.__ppOnClose is told when the page closes. */
(function () {
    'use strict';

    if (typeof gsap === 'undefined') return;
    var DATA = [];

    var CATS = ['Architecture', 'Interior Design', 'Real Estate Marketing'];
    /* ADAPTED: the category ids, in the order of the site's `set` numbers */
    var SETS = ['architecture', 'interior-design', 'real-estate-marketing'];
    function paras(t) {
        return String(t || '').split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    }
    function entry(q) {
        var photos = q.photos || [];
        var mats = q.materials || {};
        return {
            id: q.id,
            set: Math.max(0, SETS.indexOf(q.category)),
            name: q.name || 'Untitled',
            imgs: photos.map(function (ph) { return [ph.src, ph.width, ph.height, ph.alt || '', !!ph.spaced]; }),
            stats: (q.facts || []).filter(function (f) { return f.label || f.value; })
                .map(function (f) { return [f.label, f.value]; }),
            texts: (q.texts || []).map(function (t) {
                return { label: t.heading || '', ps: paras(t.body), after: t.afterPhoto || null };
            }).filter(function (t) { return t.ps.length || t.label; }),
            mats: (mats.items || []).filter(function (m) { return m.name || m.image; })
                .map(function (m) { return { name: m.name || '', src: m.image ? m.image.src : '' }; }),
            matNote: mats.note || '',
            matAfter: mats.afterPhoto || null
        };
    }
    var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* A PICTURE NOT YET IN REACH STILL HAS A SOURCE: one transparent
       pixel. With no src at all, Firefox paints the alt text in the frame
       until the real one arrives. */
    var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    /* the colour band: grey at the right edge, full colour once a
       picture's leading edge is this fraction of the window in */
    var BAND = 0.30;
    /* a block plays its entrance once its leading edge is this far in */
    var ARRIVE = 0.90;
    /* the room's own smoother closes this fraction per 60Hz frame, so a
       project page and the page it opened over feel like one hand */
    var EASE = 0.115;

    /* PAST THE END. How much wheel has to be spent against either end of
       a sheet before the page turns, and how far the sheet gives under it
       meanwhile — enough to be felt as resistance, never enough to be
       mistaken for more content. */
    var OVER = 240, RUB_MAX = 70, DRAG_OVER = 160;

    /* THE TURN, on one clock. Every part starts inside the one before it
       has finished, so the movement never comes to rest on the way: the
       old sheet is cut away, the name travels, the new sheet arrives and
       lands with the name. */
    var TURN = {
        cut:   { at: 0.00, dur: 0.95 },     /* the sheet being left        */
        name:  { at: 0.08, dur: 1.12 },     /* the line of type that moves */
        enter: { at: 0.20, dur: 1.00 },     /* the sheet arriving          */
        drift: 0.10,                        /* of the window, each sheet   */
        ease:  'power3.inOut'
    };

    /* ADAPTED: keyed by id */
    var byKey = {};
    window.__ppSetProjects = function (list) {
        DATA = list.map(entry);
        byKey = {};
        DATA.forEach(function (p) { byKey[p.id] = p; });
    };
    window.__ppCats = CATS;
    window.__ppSets = SETS;
    function inSet(set) { return DATA.filter(function (p) { return p.set === set; }); }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function list(v) { return Array.isArray(v) ? v : (v ? [v] : []); }
    /* a name broken into words, each in its own mask */
    function nameHTML(name) {
        return String(name).split(/\s+/).map(function (w) {
            return '<span class="pp-m"><span>' + esc(w) + '</span></span>';
        }).join('');
    }
    /* a paragraph broken into words, each in its own mask, so it can
       rise in the order it is read */
    function wordsHTML(text) {
        return String(text).split(/\s+/).map(function (w) {
            return '<span class="pp-wd"><span>' + esc(w) + '</span></span>';
        }).join(' ');
    }
    /* a value whose number can count: only when it carries a unit (240
       m²), or when it is asked to — a year counting up from zero is a
       joke nobody wants to be in on */
    function valueHTML(v, force) {
        var m = String(v).match(/^(\D*?)(\d+(?:[.,]\d+)?)(.*)$/);
        if (!m || (!force && !/[a-zA-Z²³%]/.test(m[3]))) return esc(v);
        return esc(m[1]) + '<span class="pp-num" data-n="' + m[2].replace(',', '.') + '">' +
               esc(m[2]) + '</span>' + esc(m[3]);
    }
    function each(nodes, fn) { Array.prototype.forEach.call(nodes, fn); }

    /* ------------------------------------------------------------------
       THE ELEMENT — the page, its bar, and three sheets
    ------------------------------------------------------------------ */
    var root = document.createElement('section');
    root.id = 'pp';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML =
        '<div class="pp-rail">' +
            '<span class="pp-rail-name"></span>' +
            '<div class="pp-map" aria-hidden="true"><div class="pp-map-in"></div><i class="pp-map-win"></i></div>' +
            '<button class="pp-close" type="button">Close</button>' +
        '</div>';
    document.body.appendChild(root);

    var rail     = root.querySelector('.pp-rail');
    var railName = root.querySelector('.pp-rail-name');
    var map      = root.querySelector('.pp-map');
    var mapIn    = root.querySelector('.pp-map-in');
    var mapWin   = root.querySelector('.pp-map-win');
    var MAPW = 1, total = 1;
    root.querySelector('.pp-close').addEventListener('click', function () { close(); });
    /* a press on the map takes the sheet there, centred on the press */
    map.addEventListener('click', function (e) {
        if (!isOpen || busy) return;
        var r = map.getBoundingClientRect();
        go((e.clientX - r.left) / r.width * total - (vertical ? VH : VW) / 2);
    });

    /* A SHEET: one project in its own view. The view cuts with its
       overflow and the mask inside it travels back against it, so a wipe
       is two transforms and never a clip-path; the track carries the
       scroll. */
    function makeSheet() {
        var view = document.createElement('div');
        view.className = 'pp-view';
        view.innerHTML = '<div class="pp-mask"><div class="pp-track"></div></div>';
        root.insertBefore(view, rail);
        return { view: view, mask: view.firstChild, track: view.firstChild.firstChild,
                 p: null, next: null, prev: null, title: null,
                 figs: [], colours: [], lazies: [], enters: [],
                 x: 0, maxX: 0, preNext: false, staged: 0 };
    }
    var sheets = [makeSheet(), makeSheet(), makeSheet()];
    /* the sheet on screen, and the two built either side of it */
    var cur = null, ahead = null, behind = null;

    /* ------------------------------------------------------------------
       STATE
    ------------------------------------------------------------------ */
    var isOpen = false, busy = false, fromCard = null;
    var x = 0, target = 0, vertical = false;
    var VW = innerWidth, VH = innerHeight;
    var openDelay = 0;
    /* wheel spent against an end, how far the sheet has given under it,
       and until when the tail of a gesture that already turned the page
       is ignored */
    var over = 0, overAt = 0, rub = 0, coolUntil = 0;
    var raf = 0, last = 0;

    /* THE MATERIAL PALETTE — PROOF OF CONCEPT, THE SAME ON EVERY PROJECT.
       Four photographed surfaces, CC0 from Poly Haven (polyhaven.com),
       loaded from their CDN. When real per-project materials exist, this
       is the one list to replace. The colour under each is measured from
       its own pixels once it loads. */
    /* ADAPTED: the palette is the project's own (materials.items) */

    function measureHex(img, em) {
        function run() {
            try {
                var c = document.createElement('canvas');
                c.width = c.height = 8;
                var x2 = c.getContext('2d');
                x2.drawImage(img, 0, 0, 8, 8);
                var d = x2.getImageData(0, 0, 8, 8).data, r = 0, g = 0, b = 0;
                for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
                var hx = '#' + [r, g, b].map(function (v) {
                    var h = Math.round(v / 64).toString(16).toUpperCase();
                    return h.length < 2 ? '0' + h : h;
                }).join('');
                em.style.setProperty('--c', hx);
                em.textContent = hx;
                em.hidden = false;
            } catch (err) { /* no CORS, no chip */ }
        }
        img.addEventListener('load', function () { if (img.src.indexOf('data:') !== 0) run(); });
    }

    function plateHTML(src, alt, lazy, cors) {
        var a = (lazy ? 'src="' + BLANK + '" data-src="' + src + '"' : 'src="' + src + '"') +
                (cors ? ' crossorigin="anonymous"' : '');
        return '<div class="pp-plate">' +
                   '<img class="pp-col" ' + a + ' alt="' + esc(alt) + '" decoding="async" draggable="false" />' +
                   '<img class="pp-grey" ' + a + ' alt="" aria-hidden="true" decoding="async" draggable="false" />' +
               '</div>';
    }

    /* ------------------------------------------------------------------
       THE RUN — a set is the order its strip shows it in
    ------------------------------------------------------------------ */
    function stripCards(set) {
        return Array.prototype.slice.call(
            document.querySelectorAll('#pfStrip .wk-card[data-set="' + set + '"]'));
    }
    function seqOf(set) {
        var out = [];
        stripCards(set).forEach(function (c) {
            var p = projectOf(c);
            if (p && out.indexOf(p) < 0) out.push(p);
        });
        return out.length ? out : inSet(set);
    }
    function cardOf(p) {
        var cs = stripCards(p.set);
        for (var i = 0; i < cs.length; i++) if (projectOf(cs[i]) === p) return cs[i];
        return null;
    }

    /* ------------------------------------------------------------------
       RENDER — the sequence of one sheet
    ------------------------------------------------------------------ */
    function render(S, p) {
        var ls  = seqOf(p.set);
        var pos = ls.indexOf(p);
        S.p = p;
        S.next = pos >= 0 ? (ls[pos + 1] || null) : null;
        S.prev = pos > 0 ? ls[pos - 1] : null;
        S.preNext = false;
        S.x = 0;
        var n     = p.imgs.length;
        var stats = list(p.stats);
        var matNote = p.matNote;
        /* ADAPTED: a gap is wider where a photograph asks for it; when none
           does, the site's own rhythm (every fourth from the third) */
        var anySpaced = p.imgs.some(function (im) { return im[4]; });

        var html =
            '<div class="pp-hang pp-title">' +
                '<div>' +
                    '<div class="pp-kick pp-in"><span>' + esc(CATS[p.set]) + '</span></div>' +
                    '<h2 class="pp-name">' + nameHTML(p.name) + '</h2>' +
                '</div>' +
                '<div class="pp-hint pp-in"><i></i><span>' + (vertical ? 'Scroll' : 'Scroll or drag') + '</span></div>' +
            '</div>';

        function fig(k) {
            var im = p.imgs[k], ar = im[1] / im[2];
            var breath = anySpaced ? (k > 0 && im[4]) : (k > 1 && k % 4 === 1);
            var cls = 'pp-fig' + (k === 0 ? ' is-cover' : '') + (breath ? ' is-breath' : '');
            return '<figure class="' + cls + '" data-enter="fig" style="--ar:' + ar.toFixed(4) + '">' +
                       '<div class="pp-frame">' + plateHTML(im[0], im[3] || (p.name + ', photograph ' + (k + 1)), k > 1) + '</div>' +
                       '<figcaption class="pp-cap"><b>' + pad(k + 1) + '</b><span>/ ' + pad(n) + '</span></figcaption>' +
                   '</figure>';
        }
        function spec() {
            var rows = stats.concat([['Photographs', String(n)]]);
            return '<div class="pp-hang pp-spec" data-enter="spec">' +
                       '<div class="pp-kick pp-in"><span>Project data</span></div>' +
                       '<div class="pp-stats">' + rows.map(function (r, i) {
                           return '<div class="pp-st"><i></i>' +
                                      '<span class="pp-m"><span class="pp-st-l">' + esc(r[0]) + '</span></span>' +
                                      '<span class="pp-m"><span class="pp-st-v">' + valueHTML(r[1], i === rows.length - 1) + '</span></span>' +
                                  '</div>';
                       }).join('') + '</div>' +
                   '</div>';
        }
        function para(g) {
            return '<div class="pp-hang pp-text' + (g.lead ? ' is-lead' : '') + '" data-enter="text">' +
                       '<div class="pp-kick pp-in"><span>' + esc(g.label) + '</span></div>' +
                       g.ps.map(function (t) { return '<p class="pp-par pp-in">' + esc(t) + '</p>'; }).join('') +
                   '</div>';
        }
        function mat() {
            return '<div class="pp-hang pp-mat" data-enter="mat">' +
                       '<div><div class="pp-kick pp-in"><span>Material palette</span></div>' +
                           (matNote ? '<p class="pp-note">' + wordsHTML(matNote) + '</p>' : '') + '</div>' +
                       '<div class="pp-sws">' + p.mats.map(function (t) {
                           return '<div class="pp-sw">' +
                                      '<div class="pp-frame">' + plateHTML(t.src || BLANK, t.name, !!t.src, true) + '</div>' +
                                      '<div class="pp-sw-cap"><b>' + esc(t.name) + '</b>' +
                                          '<em hidden></em></div>' +
                                  '</div>';
                       }).join('') + '</div>' +
                   '</div>';
        }

        /* THE SEQUENCE. Cover, then the data while the cover is still on
           screen; two photographs; the first paragraph; the palette,
           after the photographs it was taken from have been seen; the
           run; and the second paragraph somewhere past the middle, where
           the eye wants a rest from pictures. */
        /* ADAPTED: each text where the project puts it (after photograph
           n), or where the site put its three: after the 3rd, 6th, 9th */
        var AUTO = [2, 5, 8, 11];
        var groups = p.texts.map(function (t, gi) {
            return { at: t.after ? t.after - 1 : AUTO[gi], label: t.label, ps: t.ps, lead: gi === 0 };
        });
        var hasMat = p.mats.length > 0 || !!matNote;
        var mAt = hasMat ? Math.min(p.matAfter ? p.matAfter - 1 : 3, n - 1) : -1;
        if (!n) {
            html += spec();
            groups.forEach(function (g) { html += para(g); });
            if (hasMat) html += mat();
        }
        for (var k = 0; k < n; k++) {
            html += fig(k);
            if (k === 0) html += spec();
            for (var gi = 0; gi < groups.length; gi++) {
                if (Math.min(groups[gi].at, n - 1) === k) html += para(groups[gi]);
            }
            if (k === mAt) html += mat();
        }
        /* THE FOOT: the next project in the set, set at the size its own
           title will stand at so the line can travel into it unscaled —
           or, at the end of the set, the way back to the strip */
        html +=
            '<div class="pp-end" data-enter="end">' +
                '<button class="pp-next" type="button">' +
                    '<span class="pp-next-label pp-in">' + (S.next ? 'Next project' : 'Back to') + '</span>' +
                    '<span class="pp-name pp-foot-name">' + nameHTML(S.next ? S.next.name : CATS[p.set]) + '</span>' +
                '</button>' +
            '</div>';

        S.track.innerHTML = html;
        S.track.querySelector('.pp-next').addEventListener('click', function () { if (S === cur) turn(1); });

        S.title = S.track.querySelector('.pp-title');
        each(S.track.querySelectorAll('.pp-sw'), function (sw) {
            measureHex(sw.querySelector('.pp-col'), sw.querySelector('.pp-sw-cap em'));
        });
        S.figs = Array.prototype.map.call(S.track.querySelectorAll('.pp-fig'), function (el) {
            var im = el.querySelectorAll('.pp-plate img');
            return { el: el, frame: el.querySelector('.pp-frame'), col: im[0], grey: im[1], off: 0, size: 0, px: 1e9, e: -1, mg: -1 };
        });
        S.colours = Array.prototype.map.call(S.track.querySelectorAll('.pp-sw'), function (el) {
            return { el: el, grey: el.querySelector('.pp-grey'), off: 0, g: -1 };
        });
        S.lazies = Array.prototype.map.call(S.track.querySelectorAll('.pp-fig, .pp-sw'), function (el) {
            var im = el.querySelectorAll('img[data-src]');
            return { el: el, imgs: im, off: 0, size: 0, done: im.length === 0 };
        });
        hideForEntrance(S);
    }

    function clearSheet(S) {
        if (!S) return;
        S.view.className = 'pp-view';
        S.view.style.transform = S.mask.style.transform = '';
        S.track.innerHTML = '';
        S.p = S.next = S.prev = S.title = null;
        S.figs = []; S.colours = []; S.lazies = []; S.enters = [];
        S.x = S.maxX = 0;
        S.staged = 0;
    }
    function spare() {
        for (var i = 0; i < sheets.length; i++) {
            var s = sheets[i];
            if (s !== cur && s !== ahead && s !== behind) return s;
        }
        return null;
    }

    /* ------------------------------------------------------------------
       THE ENTRANCES — the state every block starts in, and what it does
       when it comes on screen
    ------------------------------------------------------------------ */
    function hideForEntrance(S) {
        if (REDUCED) return;
        var t = S.track;
        gsap.set(t.querySelectorAll('.pp-sw .pp-frame'), { clipPath: 'inset(100% 0% 0% 0%)' });
        gsap.set(t.querySelectorAll('.pp-cap, .pp-sw-cap, .pp-in'), { opacity: 0, y: 10 });
        gsap.set(t.querySelectorAll('.pp-m > span, .pp-wd > span'), { yPercent: 108 });
        gsap.set(t.querySelectorAll('.pp-st > i'), { scaleX: 0 });
    }

    function play(type, el, d) {
        if (REDUCED) return;
        var q = function (s) { return el.querySelectorAll(s); };
        /* ONE GESTURE A BLOCK, and a quiet one: a wipe, a rise, a rule */
        if (type === 'fig') {
            /* nothing: a photograph is on the page from the start, in grey;
               its colour and its opening are driven by the scroll */
        } else if (type === 'spec') {
            gsap.to(q('.pp-in'), { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out', delay: d });
            gsap.to(q('.pp-st > i'), { scaleX: 1, duration: 1.2, ease: 'power2.inOut', delay: d + 0.1 });
            gsap.to(q('.pp-st .pp-m > span'), { yPercent: 0, duration: 1.0, ease: 'power3.out', delay: d + 0.3 });
            /* and the numbers count, on the same clock as the rows arrive */
            each(q('.pp-num'), function (num, i) {
                var to = parseFloat(num.getAttribute('data-n'));
                var dec = (num.getAttribute('data-n').split('.')[1] || '').length;
                var o = { v: 0 };
                gsap.to(o, { v: to, duration: 1.6, ease: 'power3.out', delay: d + 0.35 + i * 0.08,
                    onUpdate: function () { num.textContent = o.v.toFixed(dec); } });
            });
        } else if (type === 'text') {
            gsap.to(q('.pp-in'), { opacity: 1, y: 0, duration: 1.0, stagger: 0.15, ease: 'power2.out', delay: d });
        } else if (type === 'mat') {
            gsap.to(q('.pp-in'), { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out', delay: d });
            gsap.to(q('.pp-wd > span'), { yPercent: 0, duration: 1.1, stagger: 0.022, ease: 'power3.out', delay: d + 0.15 });
            gsap.to(q('.pp-frame'), { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, stagger: 0.1, ease: 'power3.inOut', delay: d + 0.35 });
            gsap.to(q('.pp-sw-cap'), { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out', delay: d + 0.7 });
        } else if (type === 'end') {
            gsap.to(q('.pp-in'), { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out', delay: d });
            gsap.to(q('.pp-m > span'), { yPercent: 0, duration: 1.1, stagger: 0.05, ease: 'power3.out', delay: d + 0.1 });
        }
    }

    function enterTitle(S, d) {
        if (REDUCED) return;
        gsap.to(S.title.querySelectorAll('.pp-m > span'), { yPercent: 0, duration: 1.1, stagger: 0.07, ease: 'power4.out', delay: d });
        gsap.to(S.title.querySelectorAll('.pp-in'), { opacity: 1, y: 0, duration: 0.8, stagger: 0.1, ease: 'power3.out', delay: d + 0.25 });
    }

    /* A SHEET MADE READY TO BE TURNED INTO, from either side.
       Forward it is entered at its start, and its title is where the
       travelling name lands, so the title waits hidden and its kicker
       waits to fade in. Backward it is entered at its end, already read:
       everything on it stands finished, and its foot waits hidden for
       the name coming down into it. */
    function stage(S, dir) {
        S.staged = dir;
        S.view.className = 'pp-view';
        S.view.style.transform = S.mask.style.transform = '';
        var h2   = S.title.querySelector('.pp-name');
        var kick = S.title.querySelector('.pp-kick');
        var hint = S.title.querySelector('.pp-hint');
        var fn   = S.track.querySelector('.pp-foot-name');
        var fl   = S.track.querySelector('.pp-next-label');
        if (dir > 0) {
            S.x = 0;
            gsap.set(h2.querySelectorAll('.pp-m > span'), { yPercent: 0 });
            h2.style.visibility = 'hidden';
            kick.style.visibility = '';
            gsap.set([kick, hint], { opacity: 0, y: 0 });
        } else {
            S.x = S.maxX;
            if (!REDUCED) {
                var t = S.track;
                gsap.set(t.querySelectorAll('.pp-m > span, .pp-wd > span'), { yPercent: 0 });
                gsap.set(t.querySelectorAll('.pp-cap, .pp-sw-cap, .pp-in'), { opacity: 1, y: 0 });
                gsap.set(t.querySelectorAll('.pp-st > i'), { scaleX: 1 });
                gsap.set(t.querySelectorAll('.pp-sw .pp-frame'), { clipPath: 'inset(0% 0% 0% 0%)' });
            }
            S.enters.forEach(function (e) { e.el.__ppIn = true; });
            h2.style.visibility = kick.style.visibility = '';
            fn.style.visibility = fl.style.visibility = 'hidden';
        }
        paint(S, S.x, 0);
    }

    /* the pictures a turn opens onto, decoded before it is asked for
       rather than on the first frame they are seen */
    function decodeNear(S) {
        var span = vertical ? VH : VW;
        S.figs.forEach(function (f) {
            if (f.off + f.size < S.x - span * 0.2 || f.off > S.x + span * 1.2) return;
            [f.col, f.grey].forEach(function (im) {
                if (im.src.indexOf('data:') !== 0 && im.decode) im.decode().catch(function () {});
            });
        });
    }

    function build(p, dir) {
        var S = spare();
        if (!S) return null;
        clearSheet(S);
        render(S, p);
        measure(S);
        stage(S, dir);
        decodeNear(S);
        return S;
    }

    /* the neighbours are built when the page is still, one per idle
       moment, so building never lands on a frame that is moving */
    var idleId = 0;
    function idleCall(fn) {
        return window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 1200 }) : setTimeout(fn, 280);
    }
    function idleCancel(id) {
        if (!id) return;
        if (window.cancelIdleCallback) cancelIdleCallback(id); else clearTimeout(id);
    }
    function prepare() {
        if (idleId || !isOpen) return;
        idleId = idleCall(function () {
            idleId = 0;
            if (!isOpen || !cur) return;
            if (busy || raf || dragOn) { prepare(); return; }
            /* the sheet a turn has just left is put back first : it is
               the one most likely to be turned into next */
            var loose = (ahead && ahead.staged !== 1) ? [ahead, 1] : ((behind && behind.staged !== -1) ? [behind, -1] : null);
            if (loose) { stage(loose[0], loose[1]); prepare(); return; }
            if (cur.next && !(ahead && ahead.p === cur.next)) {
                clearSheet(ahead); ahead = null;
                ahead = build(cur.next, 1);
                prepare();
                return;
            }
            if (cur.prev && !(behind && behind.p === cur.prev)) {
                clearSheet(behind); behind = null;
                behind = build(cur.prev, -1);
            }
        });
    }

    /* ------------------------------------------------------------------
       MEASURE — once per sheet and per resize, never per frame
    ------------------------------------------------------------------ */
    function offOf(el) { return vertical ? el.offsetTop : el.offsetLeft; }
    function sizeOf(el) { return vertical ? el.offsetHeight : el.offsetWidth; }

    /* THE NAME, FITTED to the title column: the longest word to the
       width, all the lines to the height left between the kicker and the
       hint, and never past the size set in the CSS. Measured on a probe
       in the column itself, so the foot of one sheet can be set at the
       exact size the next sheet's title will be — same column, same
       rule, same whole pixel. */
    var sizes = {};
    function fitSize(S, name) {
        if (sizes[name]) return sizes[name];
        var title = S.title, h2 = title.querySelector('.pp-name');
        var probe = document.createElement('h2');
        probe.className = 'pp-name';
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;';
        probe.innerHTML = String(name).split(/\s+/).map(function (w) {
            return '<span class="pp-m"><span>' + esc(w) + '</span></span>';
        }).join('');
        h2.parentNode.appendChild(probe);
        var cap = parseFloat(getComputedStyle(probe).fontSize);
        var REF = 100;
        probe.style.fontSize = REF + 'px';
        var w = 0;
        each(probe.querySelectorAll('.pp-m > span'), function (s) { w = Math.max(w, s.scrollWidth); });
        var size = REF * title.clientWidth / Math.max(1, w);
        if (!vertical) {
            var cs = getComputedStyle(title);
            var hint = title.querySelector('.pp-hint'), kick = title.querySelector('.pp-kick');
            var room = title.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) -
                       hint.offsetHeight - kick.offsetHeight - 48;
            size = Math.min(size, REF * room / Math.max(1, probe.offsetHeight));
        }
        probe.remove();
        return (sizes[name] = Math.max(24, Math.floor(Math.min(size, cap))));
    }

    function measure(S) {
        VW = innerWidth; VH = innerHeight;
        vertical = matchMedia('(max-width: 900px)').matches;
        S.title.querySelector('.pp-name').style.fontSize = fitSize(S, S.p.name) + 'px';
        var fn = S.track.querySelector('.pp-foot-name');
        if (fn) fn.style.fontSize = S.next ? fitSize(S, S.next.name) + 'px' : '';
        S.figs.forEach(function (f) { f.off = offOf(f.el); f.size = sizeOf(f.el); });
        S.colours.forEach(function (c) { c.off = offOf(c.el); });
        S.lazies.forEach(function (l) { l.off = offOf(l.el); l.size = sizeOf(l.el); });
        S.enters = Array.prototype.map.call(S.track.querySelectorAll('[data-enter]'), function (el) {
            return { el: el, type: el.getAttribute('data-enter'), off: offOf(el) };
        });
        S.maxX = vertical ? Math.max(0, S.track.scrollHeight - VH) : Math.max(0, S.track.scrollWidth - VW);
        S.x = Math.min(S.x, S.maxX);
    }

    /* THE MAP. The whole sheet at a hundred-odd pixels wide: every
       photograph a small block that fills in as it takes its colour,
       every block of words a hairline, and a frame for what is on screen
       now. */
    function buildMap(S) {
        total = (vertical ? S.track.scrollHeight : S.track.scrollWidth) || 1;
        MAPW = map.clientWidth || 1;
        var s = MAPW / total, h = '';
        each(S.track.children, function (el) {
            var k = el.classList.contains('pp-fig') ? 'is-pic' : 'is-word';
            h += '<b class="' + k + '" style="left:' + (offOf(el) * s).toFixed(2) + 'px;width:' +
                 Math.max(1, sizeOf(el) * s).toFixed(2) + 'px"></b>';
        });
        mapIn.innerHTML = h;
        var pics = mapIn.querySelectorAll('.is-pic');
        S.figs.forEach(function (f, i) { f.map = pics[i]; f.mg = -1; });
        mapWin.style.width = Math.max(4, (vertical ? VH : VW) * s).toFixed(2) + 'px';
    }
    function showRail(S) {
        railName.innerHTML = esc(S.p.name) + '<span>' + esc(CATS[S.p.set]) + '</span>';
        buildMap(S);
    }

    /* ------------------------------------------------------------------
       ONE FRAME OF ONE SHEET
    ------------------------------------------------------------------ */
    function shift(el, v) {
        el.style.transform = vertical ? 'translate3d(0,' + v.toFixed(2) + 'px,0)'
                                      : 'translate3d(' + v.toFixed(2) + 'px,0,0)';
    }

    function paint(S, X, give) {
        var span = vertical ? VH : VW;
        var band = span * BAND;
        var live = S === cur;
        var i;

        /* the give past either end is drawn on the track alone : nothing
           below reads it, so the colours and entrances do not move with it */
        shift(S.track, -(X + (give || 0)));
        if (live) mapWin.style.transform = 'translate3d(' + (X * MAPW / total).toFixed(2) + 'px,0,0)';

        /* each picture's source, as it comes within reach on either side */
        for (i = 0; i < S.lazies.length; i++) {
            var l = S.lazies[i];
            if (!l.done && l.off - X < span * 1.6 && l.off + l.size - X > -span * 0.6) {
                each(l.imgs, function (im) { im.src = im.getAttribute('data-src'); });
                l.done = true;
            }
        }

        /* THE COLOUR. 0 at the right edge, 1 once it is BAND in. Written
           only when it has moved, so a still screen writes nothing. */
        for (i = 0; i < S.colours.length; i++) {
            var c = S.colours[i];
            var g = REDUCED ? 1 : Math.min(1, Math.max(0, (span - (c.off - X)) / band));
            if (Math.abs(g - c.g) > 0.002) { c.grey.style.opacity = (1 - g).toFixed(3); c.g = g; }
        }

        for (i = 0; i < S.figs.length; i++) {
            var f = S.figs[i];
            var s = f.off - X;
            var onScreen = s < span && s + f.size > 0;
            /* driven by the photograph's CENTRE: grey while it is at the
               right edge, full colour and full size once it has been
               scrolled to just left of the middle */
            var mg = REDUCED ? 1 : Math.min(1, Math.max(0, (span * 0.95 - (s + f.size / 2)) / (span * 0.5)));
            if (onScreen && !REDUCED) {
                /* THE FRAME OPENS as the picture takes its colour */
                var e2 = mg * mg * (3 - 2 * mg);
                if (Math.abs(e2 - f.e) > 0.002) {
                    var a = ((1 - e2) * 6).toFixed(2), b = ((1 - e2) * 4).toFixed(2);
                    f.frame.style.clipPath = 'inset(' + a + '% ' + b + '% ' + a + '% ' + b + '%)';
                    f.e = e2;
                }
                /* and the picture runs a little against the page inside it */
                var cc = s + f.size / 2 - span / 2;
                var px = Math.max(-1, Math.min(1, cc / span)) * -5;
                if (Math.abs(px - f.px) > 0.01) {
                    var t = vertical ? 'translate3d(0,' + px.toFixed(2) + '%,0) scale(1.12)'
                                     : 'translate3d(' + px.toFixed(2) + '%,0,0) scale(1.12)';
                    f.col.style.transform = t; f.grey.style.transform = t; f.px = px;
                }
            }
            if (Math.abs(mg - f.mg) > 0.002) {
                f.grey.style.opacity = (1 - mg).toFixed(3);
                if (live && f.map) f.map.style.opacity = (0.2 + 0.8 * mg).toFixed(3);
                f.mg = mg;
            }
        }

        /* and, on the sheet being read, every block that has come far
           enough in plays its entrance */
        if (!live || busy) return;
        for (i = 0; i < S.enters.length; i++) {
            var e = S.enters[i];
            if (!e.el.__ppIn && e.off - X < span * ARRIVE) {
                e.el.__ppIn = true;
                play(e.type, e.el, openDelay);
                openDelay = Math.max(0, openDelay - 0.12);
            }
        }
    }

    function loop(now) {
        raf = 0;
        if (!cur) return;
        var dt = last ? Math.min((now - last) / 16.6667, 4) : 1;
        last = now;
        var k = 1 - Math.pow(1 - EASE, dt);
        x += (target - x) * k;
        if (Math.abs(target - x) < 0.05) x = target;
        /* the give lets go once nothing is pushing on it; mid-turn it is
           held, on the sheet being left */
        if (rub !== 0 && !busy && !dragOn && now - overAt > 90) {
            rub *= Math.pow(0.8, dt);
            if (Math.abs(rub) < 0.3) rub = 0;
        }
        openDelay = 0;
        cur.x = x;
        if (!busy) paint(cur, x, rub);
        if (!busy && cur.next && !cur.preNext && x > cur.maxX - (vertical ? VH : VW) * 2) {
            cur.preNext = true;
            prepare();
        }
        if (isOpen && !busy && (x !== target || rub !== 0)) raf = requestAnimationFrame(loop);
        else last = 0;
    }
    function kick() { if (!raf && !busy) raf = requestAnimationFrame(loop); }
    function go(to) { if (!cur) return; target = Math.max(0, Math.min(cur.maxX, to)); kick(); }
    function atEnd()   { return cur && target >= cur.maxX - 0.5 && x >= cur.maxX - 2; }
    function atStart() { return cur && target <= 0.5 && x <= 2; }
    function give(amount) {
        rub = (amount > 0 ? 1 : -1) * RUB_MAX * (1 - Math.exp(-Math.abs(amount) / 220));
        kick();
    }

    /* ------------------------------------------------------------------
       INPUT — all of it in the capture phase, all of it swallowed while
       the page is open
    ------------------------------------------------------------------ */
    addEventListener('wheel', function (e) {
        if (!isOpen) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        var now = performance.now();
        /* a turn swallows the rest of the gesture that started it : a
           trackpad keeps sending momentum for a second after the fingers
           have left, and that tail must not turn the next page too */
        if (busy || now < coolUntil) { coolUntil = Math.max(coolUntil, now + 220); return; }
        var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (e.deltaMode === 1) d *= 16;
        else if (e.deltaMode === 2) d *= VH;
        /* PAST AN END the wheel is not lost: it is spent against the end,
           the sheet gives a little under it, and past OVER the page turns */
        if ((d > 0 && atEnd()) || (d < 0 && atStart())) {
            if (now - overAt > 260 || (over !== 0 && (over > 0) !== (d > 0))) over = 0;
            over += d;
            overAt = now;
            give(over);
            if (Math.abs(over) > OVER) {
                var ahead_ = over > 0;
                over = 0;
                coolUntil = now + 220;
                turn(ahead_ ? 1 : -1);
            }
            return;
        }
        over = 0;
        go(target + d);
    }, { passive: false, capture: true });

    addEventListener('keydown', function (e) {
        if (!isOpen) return;
        var step = (vertical ? VH : VW) * 0.55;
        var k = e.key;
        if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
        if (busy) return;
        if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ') {
            if (atEnd()) turn(1); else go(target + step);
        } else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') {
            if (atStart()) turn(-1); else go(target - step);
        }
        else if (k === 'Home') go(0);
        else if (k === 'End') go(cur ? cur.maxX : 0);
        else return;
        e.preventDefault();
        e.stopImmediatePropagation();
    }, true);

    /* DRAG — pointer and touch alike, one to one under the finger, and
       the last velocity handed to the easing on release so a flick
       carries. Dragged past an end, the sheet gives; let go far enough
       past it and the page turns. */
    var dragOn = false, dragFrom = 0, dragAt = 0, dragRaw = 0, vel = 0, lastT = 0;
    root.addEventListener('pointerdown', function (e) {
        if (!isOpen || busy || e.button > 0) return;
        if (e.target.closest && e.target.closest('button, .pp-rail')) return;
        dragOn = true;
        dragFrom = vertical ? e.clientY : e.clientX;
        dragAt = dragRaw = target;
        vel = 0; lastT = performance.now();
        root.classList.add('is-dragging');
        if (root.setPointerCapture) root.setPointerCapture(e.pointerId);
    });
    root.addEventListener('pointermove', function (e) {
        if (!dragOn || !cur) return;
        var p = vertical ? e.clientY : e.clientX;
        var now = performance.now();
        var nt = dragAt - (p - dragFrom) * 1.15;
        vel = (nt - target) / Math.max(1, now - lastT);
        lastT = now;
        dragRaw = nt;
        if (nt > cur.maxX) give(nt - cur.maxX);
        else if (nt < 0) give(nt);
        else if (rub !== 0) { rub = 0; kick(); }
        go(nt);
    });
    function endDrag() {
        if (!dragOn) return;
        dragOn = false;
        root.classList.remove('is-dragging');
        if (!cur) return;
        if (dragRaw > cur.maxX + DRAG_OVER && atEnd()) { turn(1); return; }
        if (dragRaw < -DRAG_OVER && atStart()) { turn(-1); return; }
        overAt = 0;
        kick();
        go(target + vel * 260);
    }
    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);

    addEventListener('resize', function () {
        if (!isOpen || busy || !cur) return;
        sizes = {};
        clearSheet(ahead); clearSheet(behind); ahead = behind = null;
        measure(cur);
        x = target = Math.min(x, cur.maxX);
        buildMap(cur);
        paint(cur, x, 0);
        cur.preNext = false;
        prepare();
    });

    /* the rectangle a card occupies, as an inset of the window */
    function insetOf(el) {
        var r = el.getBoundingClientRect();
        if (r.width < 2 || r.bottom < 0 || r.top > VH || r.right < 0 || r.left > VW) return null;
        return 'inset(' + Math.max(0, r.top).toFixed(1) + 'px ' +
                          Math.max(0, VW - r.right).toFixed(1) + 'px ' +
                          Math.max(0, VH - r.bottom).toFixed(1) + 'px ' +
                          Math.max(0, r.left).toFixed(1) + 'px)';
    }
    var FULL = 'inset(0px 0px 0px 0px)';
    function shut() { return 'inset(' + (VH / 2).toFixed(1) + 'px 0px ' + (VH / 2).toFixed(1) + 'px 0px)'; }

    /* ------------------------------------------------------------------
       OPEN
    ------------------------------------------------------------------ */
    function open(p, card) {
        if (busy || !p) return;
        busy = true; isOpen = true;
        fromCard = card || null;
        VW = innerWidth; VH = innerHeight;
        vertical = matchMedia('(max-width: 900px)').matches;
        sizes = {};

        sheets.forEach(clearSheet);
        ahead = behind = null;
        cur = sheets[0];
        render(cur, p);
        root.style.visibility = 'visible';
        root.setAttribute('aria-hidden', 'false');
        document.body.classList.add('pp-open');
        measure(cur);
        cur.view.className = 'pp-view is-cur';
        x = target = cur.x = 0; rub = over = 0;
        showRail(cur);
        gsap.set(rail, { clearProps: 'opacity,visibility' });

        var from = (card && insetOf(card.querySelector('.wk-frame') || card)) || shut();
        function opened() {
            busy = false;
            /* the page stands still now : no clip on it while it is read */
            root.style.clipPath = 'none';
            paint(cur, x, 0);
            prepare();
        }
        if (REDUCED) {
            gsap.fromTo(root, { opacity: 0, clipPath: FULL }, { opacity: 1, duration: 0.3, onComplete: opened });
            paint(cur, 0, 0);
            return;
        }
        gsap.fromTo(root, { clipPath: from, opacity: 1 },
            { clipPath: FULL, duration: 1.05, ease: 'power4.inOut',
              onComplete: function () {
                  opened();
                  root.querySelector('.pp-close').focus({ preventScroll: true });
              } });
        gsap.fromTo(rail, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out', delay: 0.8 });
        enterTitle(cur, 0.55);
        /* whatever is on screen at the start plays in behind the title */
        busy = false; openDelay = 0.75; paint(cur, 0, 0); busy = true;
    }

    /* ------------------------------------------------------------------
       THE TURN — one sheet into the next, or back into the last

       Forward: what is on the LEFT of the window goes first, cut away
       from its left edge while it drifts on; the name at the foot RISES
       into the place the new title stands; the new sheet arrives from
       the RIGHT, its last edge landing as the name does. Backward, the
       same the other way: the right goes first, the title comes DOWN
       into the foot of the previous project, and that sheet returns from
       the left. On the way down it says where it is going — Previous
       project, and its name — and as it settles into the foot it says
       what the foot says there: Next project, and the one you came from.

       The name is one line of type the whole way: a copy laid over the
       window, set at the size of the place it leaves AND the place it
       lands, which are the same size by construction — so it is only
       ever translated, never scaled, and the real text it hands over to
       at either end is the same pixels in the same place.
    ------------------------------------------------------------------ */
    function boxOf(el) {
        var r = el.getBoundingClientRect();
        return { l: r.left, t: r.top };
    }
    function ghost(src, cls, html) {
        var g = document.createElement('div');
        g.className = cls + ' pp-ghost';
        g.setAttribute('aria-hidden', 'true');
        g.innerHTML = html;
        var b = boxOf(src);
        g.style.left = b.l + 'px';
        g.style.top  = b.t + 'px';
        g.style.fontSize = getComputedStyle(src).fontSize;
        root.appendChild(g);
        g.__b = b;
        return g;
    }
    function turn(dir) {
        if (!isOpen || busy || !cur) return;
        var to = dir > 0 ? cur.next : cur.prev;
        if (!to) { toStrip(); return; }

        /* the sheet to turn into : built already, or built now — at the
           instant of the gesture, before anything has started to move */
        var inc = dir > 0 ? ahead : behind;
        if (!inc || inc.p !== to) {
            clearSheet(inc);
            if (dir > 0) ahead = null; else behind = null;
            inc = build(to, dir);
            if (!inc) return;
            if (dir > 0) ahead = inc; else behind = inc;
        } else if (inc.staged !== dir) {
            stage(inc, dir);
        }

        idleCancel(idleId); idleId = 0;
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        busy = true; over = 0; dragOn = false;
        var old = cur;
        old.x = x;

        if (REDUCED) { crossTo(old, inc, dir); return; }

        var src, srcLabel, tgt, tgtLabel = null, oldHint = null;
        if (dir > 0) {
            src      = old.track.querySelector('.pp-foot-name');
            srcLabel = old.track.querySelector('.pp-next-label');
            tgt      = inc.title.querySelector('.pp-name');
        } else {
            src      = old.title.querySelector('.pp-name');
            srcLabel = old.title.querySelector('.pp-kick');
            oldHint  = old.title.querySelector('.pp-hint');
            tgt      = inc.track.querySelector('.pp-foot-name');
            tgtLabel = inc.track.querySelector('.pp-next-label');
        }
        /* where everything lands is read now, with the new sheet standing
           exactly where it will stand at the end */
        var tb = boxOf(tgt);

        var leaving = old.p.name;
        var g  = ghost(src, 'pp-name', nameHTML(dir > 0 ? to.name : leaving));
        src.style.visibility = 'hidden';

        var span = vertical ? VH : VW, s = dir, D = TURN.drift * span;
        var pa = { v: 0 }, pb = { v: 0 };
        function drawOld() {
            var a = pa.v;
            shift(old.view, s * span * a);
            shift(old.mask, -s * span * a - s * D * a);
        }
        function drawNew() {
            var b = 1 - pb.v;
            shift(inc.view, s * span * b);
            shift(inc.mask, -s * span * b + s * D * b);
        }
        drawNew();
        inc.view.className = 'pp-view is-in';

        var back = dir < 0;
        /* going back keeps its slightly longer clock */
        var k = back ? 1.25 : 1;
        var tl = gsap.timeline({ onComplete: land });
        tl.to(pa, { v: 1, duration: TURN.cut.dur * k,   ease: TURN.ease, onUpdate: drawOld }, TURN.cut.at);
        tl.to(pb, { v: 1, duration: TURN.enter.dur * k, ease: TURN.ease, onUpdate: drawNew }, TURN.enter.at * k);
        var endAt = Math.max(TURN.enter.at * k + TURN.enter.dur * k, TURN.name.at + TURN.name.dur * k);
        tl.to(g, { x: tb.l - g.__b.l, y: tb.t - g.__b.t, force3D: true,
                   duration: endAt - TURN.name.at, ease: TURN.ease }, TURN.name.at);
        tl.to(rail, { autoAlpha: 0, duration: 0.25, ease: 'power1.in' }, 0);
        tl.call(function () { showRail(inc); }, null, 0.4);
        tl.to(rail, { autoAlpha: 1, duration: 0.45, ease: 'power1.out' }, endAt - 0.3);

        if (!back) {
            if (srcLabel) tl.to(srcLabel, { opacity: 0, duration: 0.3, ease: 'power1.in' }, 0);
            var kick = inc.title.querySelector('.pp-kick'), hint = inc.title.querySelector('.pp-hint');
            tl.to([kick, hint], { opacity: 1, duration: 0.55, stagger: 0.08, ease: 'power1.out' }, endAt - 0.3);
        } else {
            /* the name only travels, it never changes what it says : the
               kicker goes as forward's label goes, the foot's label comes
               in as forward's kicker comes in */
            tl.to([srcLabel, oldHint].filter(Boolean), { opacity: 0, duration: 0.3, ease: 'power1.in' }, 0);
            if (tgtLabel) {
                gsap.set(tgtLabel, { opacity: 0, y: 0 });
                tgtLabel.style.visibility = '';
                tl.to(tgtLabel, { opacity: 1, duration: 0.55, ease: 'power1.out' }, endAt - 0.3);
            }
        }

        function land() {
            /* one frame : the copies go and the real type is there, the
               same size in the same place */
            tgt.style.visibility = '';
            if (tgtLabel) { tgtLabel.style.visibility = ''; gsap.set(tgtLabel, { opacity: 1, y: 0 }); }
            g.remove();

            inc.view.className = 'pp-view is-cur';
            inc.view.style.transform = inc.mask.style.transform = '';
            old.view.className = 'pp-view';
            old.view.style.transform = old.mask.style.transform = '';

            /* the sheet just left is the neighbour on the other side, as
               it stands — only put back where a turn into it lands */
            if (dir > 0) { if (behind !== inc) clearSheet(behind); behind = old; ahead = null; }
            else         { if (ahead !== inc)  clearSheet(ahead);  ahead = old;  behind = null; }
            cur = inc;
            cur.staged = 0;
            /* put back in idle time, not on the frame that lands */
            old.staged = 0;

            x = target = cur.x; rub = 0;
            busy = false;
            coolUntil = Math.max(coolUntil, performance.now() + 120);
            openDelay = 0.1;
            paint(cur, x, 0);
            prepare();
        }
    }

    /* the reduced-motion turn : a cross-fade onto the same landing */
    function crossTo(old, inc, dir) {
        inc.view.className = 'pp-view is-in';
        gsap.fromTo(inc.view, { opacity: 0 }, { opacity: 1, duration: 0.25, onComplete: function () {
            gsap.set(inc.view, { clearProps: 'opacity' });
            var h2 = inc.title.querySelector('.pp-name');
            h2.style.visibility = '';
            each(inc.track.querySelectorAll('.pp-foot-name, .pp-next-label'), function (el) { el.style.visibility = ''; });
            inc.view.className = 'pp-view is-cur';
            old.view.className = 'pp-view';
            if (dir > 0) { if (behind !== inc) clearSheet(behind); behind = old; ahead = null; }
            else         { if (ahead !== inc)  clearSheet(ahead);  ahead = old;  behind = null; }
            cur = inc;
            cur.staged = 0;
            stage(old, -dir);
            x = target = cur.x;
            showRail(cur);
            busy = false;
            paint(cur, x, 0);
            prepare();
        } });
    }

    /* PAST EITHER END OF THE SET: back into the strip, folding onto the
       card of the project on screen — which the strip first brings into
       view, underneath, where nobody can see it move */
    function toStrip() {
        var card = cur && cur.p && cardOf(cur.p);
        if (card) {
            if (typeof window.__pfReveal === 'function') window.__pfReveal(card);
            fromCard = card;
        }
        close();
    }

    /* ------------------------------------------------------------------
       CLOSE — back into the card if it is still on screen
    ------------------------------------------------------------------ */
    function close() {
        if (!isOpen || busy) return;
        busy = true;
        idleCancel(idleId); idleId = 0;
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        var to = (fromCard && insetOf(fromCard.querySelector('.wk-frame') || fromCard)) || shut();
        gsap.fromTo(root, { clipPath: FULL }, {
            clipPath: to, opacity: REDUCED ? 0 : 1,
            duration: REDUCED ? 0.25 : 0.85, ease: 'power3.inOut',
            onComplete: function () {
                isOpen = false; busy = false;
                root.style.visibility = 'hidden';
                root.setAttribute('aria-hidden', 'true');
                document.body.classList.remove('pp-open');
                each(root.querySelectorAll('.pp-ghost'), function (g) { g.remove(); });
                sheets.forEach(clearSheet);
                cur = ahead = behind = null;
                rub = over = 0;
                if (fromCard && fromCard.focus) fromCard.focus({ preventScroll: true });
                if (typeof window.__ppOnClose === 'function') window.__ppOnClose();   /* ADAPTED */
            }
        });
    }

    /* ------------------------------------------------------------------
       THE HOOK — a press on any card in the strip, in any set
    ------------------------------------------------------------------ */
    /* ADAPTED: the card names its project */
    function projectOf(card) {
        return byKey[card.getAttribute('data-pid')] || null;
    }

    /* THE CARD IS REMEMBERED AT THE PRESS, NOT READ OFF THE CLICK.

       The strip takes pointer capture on pointerdown so that it can be
       dragged, and once an element holds the capture the browser hands
       the click to IT: e.target is the strip, not the card under the
       finger. At pointerdown the target is still the card, and this
       listener runs in the capture phase on the document, before the
       strip has taken anything. The click is only the confirmation that
       the press was a press and not a drag. A card activated from the
       keyboard has no pointerdown at all, so the click's own target is
       the fallback. */
    var downCard = null, downX = 0, downY = 0;
    document.addEventListener('pointerdown', function (e) {
        downCard = (e.target.closest && e.target.closest('#pfStrip .wk-card')) || null;
        downX = e.clientX; downY = e.clientY;
    }, true);
    document.addEventListener('click', function (e) {
        var hit     = e.target.closest && e.target.closest('#pfStrip .wk-card');
        var inStrip = e.target.closest && e.target.closest('#pfStrip');
        var card    = downCard || hit;
        var moved   = downCard ? Math.hypot(e.clientX - downX, e.clientY - downY) : 0;
        downCard = null;
        if (!card || !inStrip) return;
        e.preventDefault();
        /* a drag that happens to end on a card is not a press */
        if (moved > 6) return;
        open(projectOf(card), card);
    }, true);

    window.__openProject = function (card) { open(projectOf(card), card); };

    /* ADAPTED: the live preview. The open sheet is rebuilt from the new
       data where it stands; what has already been read stays finished, and
       what is still to the right arrives the way it always does. */
    function finish(el) {
        if (REDUCED) return;
        gsap.set(el.querySelectorAll('.pp-m > span, .pp-wd > span'), { yPercent: 0 });
        gsap.set(el.querySelectorAll('.pp-cap, .pp-sw-cap, .pp-in'), { opacity: 1, y: 0 });
        gsap.set(el.querySelectorAll('.pp-st > i'), { scaleX: 1 });
        gsap.set(el.querySelectorAll('.pp-sw .pp-frame'), { clipPath: 'inset(0% 0% 0% 0%)' });
    }
    window.__ppRefresh = function (id) {
        if (!isOpen || busy || !cur) return false;
        var p = byKey[id] || (cur.p && byKey[cur.p.id]);
        if (!p) return false;
        idleCancel(idleId); idleId = 0;
        clearSheet(ahead); clearSheet(behind); ahead = behind = null;
        sizes = {};
        var keep = x;
        render(cur, p);
        measure(cur);
        cur.view.className = 'pp-view is-cur';
        x = target = cur.x = Math.min(keep, cur.maxX);
        finish(cur.title);
        cur.enters.forEach(function (e) {
            if (e.off - x < (vertical ? VH : VW) * ARRIVE) { finish(e.el); e.el.__ppIn = true; }
        });
        showRail(cur);
        paint(cur, x, 0);
        cur.preNext = false;
        prepare();
        return true;
    };
    window.__ppIsOpen = function () { return isOpen; };
    window.__ppCurrent = function () { return cur && cur.p ? cur.p.id : null; };
    /* for tests : the turn, without having to spend a wheel on it */
    window.__ppTurn = function (dir) { turn(dir > 0 ? 1 : -1); };
    window.__ppState = function () {
        return { open: isOpen, busy: busy, x: x, maxX: cur ? cur.maxX : 0, cur: cur && cur.p && cur.p.name,
                 next: cur && cur.next && cur.next.name, prev: cur && cur.prev && cur.prev.name,
                 ahead: ahead && ahead.p && ahead.p.name, behind: behind && behind.p && behind.p.name };
    };
})();
