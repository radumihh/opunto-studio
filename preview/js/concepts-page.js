/* ==================================================================
   THE CONCEPTS PROJECT PAGE — COPIED FROM zx-final/js/concepts-x.js
   (the `openProject` module), so the preview is the site's own code.

   Changed only where marked ADAPTED:
     - the room's globals (REDUCED, COARSE, ROOM, q, qa, lenis,
       scrollLock) are declared here, since the rest of concepts-x.js
       is not loaded;
     - M.wall is filled from the database (window.__cxSetProjects), and
       every project shows its own photographs at their own proportions
       — no library frames, no placeholder copy;
     - window.__cxRefresh re-renders the open project in place, at the
       same position, for the live preview.
   ================================================================== */
(function () {
    'use strict';

    /* ADAPTED: the room's globals */
    var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var COARSE  = matchMedia('(hover: none), (pointer: coarse)').matches;
    var ROOM = document.getElementById('subsite-concepts');
    var q  = function (s, c) { return (c || ROOM).querySelector(s); };
    var qa = function (s, c) { return Array.prototype.slice.call((c || ROOM).querySelectorAll(s)); };
    var lenis = null;
    function scrollLock() {}

    /* ADAPTED: the manifest, from the database */
    var M = { wall: [] };
    function paras(t) {
        return String(t || '').split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    function entry(p, i) {
        var photos = p.photos || [];
        var ar = {};
        photos.forEach(function (ph) { ar[ph.src] = ph.width / ph.height; });
        return {
            id: p.id,
            src: photos[0] ? photos[0].src : '',
            shots: photos.map(function (ph) { return ph.src; }),
            alts: photos.map(function (ph) { return ph.alt || ''; }),
            ar: ar,
            tag: p.wallSlot || '',
            no: String(i + 1).padStart(3, '0'),
            facts: (p.facts || []).filter(function (f) { return f.label || f.value; })
                .map(function (f) { return [f.label, f.value]; }),
            story: p.story || '',
            desc: p.summary || '',
            title: p.title || 'Untitled',
            place: p.place || '',
            year: p.year || '',
            type: p.type || '',
            notes: paras(p.approach),
            scope: (p.scope || []).filter(Boolean)
        };
    }
    window.__cxSetProjects = function (list) { M.wall = list.map(entry); };
    window.__cxIndexOf = function (id) {
        for (var i = 0; i < M.wall.length; i++) if (M.wall[i].id === id) return i;
        return -1;
    };

    var openProject = (function () {
        var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        var FINE = !COARSE;
        var root = null, scroller = null, track = null, wipe = null;
        var railEl = null, railNo = null, railName = null, railN = null;
        var map = null, mapIn = null, mapWin = null;
        var setX = null, idx = -1, closing = null, fromRect = null, wasLocked = false;
        var cur = 0, target = 0, raf = 0, last = 0, driving = false, busy = false;
        var VW = innerWidth, VH = innerHeight, maxPos = 0, total = 1, MAPW = 1;
        var figs = [], enters = [], lazies = [], shownN = -1, nShots = 1, openDelay = 0;
        /* ONWARD. Wheel spent against either end of the sheet, how far the
           sheet has given under it, and until when the tail of a gesture
           that already turned the page is ignored. Past OVER, the next
           project (or the one before) takes the sheet's place. */
        var OVER = 260, RUB_MAX = 64, over = 0, overAt = 0, rub = 0, coolUntil = 0, goLine = null;
        function wrapI(i) { var n = M.wall.length; return ((i % n) + n) % n; }

        /* ADAPTED: the proportions come from the uploaded files, and a
           project shows its own photographs and nothing else */
        var CUR_AR = {};
        function arOf(src) { return (CUR_AR[src] || 1.7768).toFixed(4); }
        function shotsOf(a) { CUR_AR = a.ar || {}; return a.shots.slice(); }

        function esc(s) {
            return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
            });
        }
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        function big(src) { return src; }   /* ADAPTED: one size, already the large one */
        function unit(v) { return esc(String(v)).replace(/\bm2\b/, 'm²'); }
        function words(s) {
            return String(s).split(/\s+/).map(function (w) {
                return '<span class="pj-m"><span>' + esc(w) + '</span></span>';
            }).join('');
        }
        /* a quantity whose number counts up as its row arrives */
        function counted(v) {
            var m = String(v).match(/^(\d+(?:\.\d+)?)(.*)$/);
            if (!m) return unit(v);
            return '<span class="pj-num" data-n="' + m[1] + '">' + m[1] + '</span>' + unit(m[2]);
        }
        function story(a) {
            var t = esc(a.story || a.desc || '');
            var m = t.match(/^([^.]+\.)\s*([\s\S]*)$/);
            return m ? '<span class="lead">' + m[1] + '</span> ' + m[2] : t;
        }

        /* ---- ONE MASK PER LINE ------------------------------------------
           There is no line element in HTML, so the lines have to be found:
           every word is boxed, the boxes are grouped by the top they came
           out at, and each group is moved into a mask of its own. Text
           nodes are the only place words live, so a tree walker finds
           exactly those and nothing else. */
        function splitLines(el) {
            if (!el || el.getAttribute('data-split')) return;
            el.setAttribute('data-split', '1');
            var texts = [], walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), n;
            while ((n = walk.nextNode())) texts.push(n);
            texts.forEach(function (t) {
                var lead = t.parentNode && t.parentNode.classList &&
                           t.parentNode.classList.contains('lead');
                var frag = document.createDocumentFragment();
                t.nodeValue.split(/(\s+)/).forEach(function (part) {
                    if (!part) return;
                    if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
                    var w = document.createElement('w');
                    if (lead) w.className = 'lead';
                    w.textContent = part;
                    w.style.display = 'inline-block';
                    frag.appendChild(w);
                });
                t.parentNode.replaceChild(frag, t);
            });
            var ws = qa('w', el);
            if (!ws.length) return;
            var lines = [], top = null, buf = null;
            ws.forEach(function (w) {
                var t = Math.round(w.offsetTop);
                if (top === null || Math.abs(t - top) > 4) { buf = []; lines.push(buf); top = t; }
                buf.push(w);
            });
            el.innerHTML = '';
            lines.forEach(function (group) {
                var mask = document.createElement('span');
                mask.className = 'pj-m';
                var inner = document.createElement('span');
                group.forEach(function (w, k) {
                    w.style.display = 'inline';
                    if (k) inner.appendChild(document.createTextNode(' '));
                    inner.appendChild(w);
                });
                mask.appendChild(inner);
                el.appendChild(mask);
            });
        }

        /* ==============================================================
           THE SHEET
        ============================================================== */
        function sheet(a, i) {
            var shots = shotsOf(a, i), n = shots.length;
            var nxI = (i + 1) % M.wall.length, nx = M.wall[nxI];
            nShots = n;

            function fig(k, inset) {
                if (!shots[k]) return '';   /* ADAPTED: fewer than five photographs */
                var lazy = k > 1;
                var src = big(shots[k]);
                var at = lazy ? 'src="' + BLANK + '" data-src="' + src + '"' : 'src="' + src + '"';
                return '<figure class="pj-pic' + (inset ? ' is-inset' : '') + '"' + (inset ? ' data-enter="fig"' : '') + ' style="--ar:' + arOf(shots[k]) + '">' +
                           (inset ? '<figcaption class="pj-cap pj-in"><b>' + pad(k + 1) + '</b><span>/ ' + pad(n) + '</span></figcaption>' : '') +
                           '<div class="pj-frame"><div class="pj-plate">' +
                               '<img ' + at + ' alt="' + esc(a.alts[k] || (a.title + ', frame ' + (k + 1))) + '" decoding="async" draggable="false" />' +
                           '</div><i class="pj-dev"></i></div>' +
                       '</figure>';
            }
            function kick(label, extra) {
                return '<div class="pj-kick pj-in"><span class="pj-label">' + esc(label) + '</span>' + (extra || '') + '</div>';
            }

            /* the kind of work across both columns, then the quantities in pairs */
            var rows = [['work', esc(a.type), 1], ['where', esc(a.place)], ['year', esc(a.year)]]
                .concat((a.facts || []).map(function (f) { return [f[0], counted(f[1])]; }))
                .concat([['frames', '<span class="pj-num" data-n="' + n + '">' + n + '</span>']]);

            return '' +
            /* THE NAME, fitted to its column, with the where and when at
               its foot and the one instruction the page gives */
            '<div class="pj-hang pj-title" data-enter="title">' +
                '<div>' +
                    kick(a.type, '<span class="pj-no">' + esc(a.no) + '</span>') +
                    '<h2 class="pj-name" id="pjTitle">' + words(a.title) + '</h2>' +
                '</div>' +
                '<div class="pj-tfoot">' +
                    '<div class="pj-pair pj-in"><span class="pj-label">where</span><span class="pj-val">' + esc(a.place) + '</span></div>' +
                    '<div class="pj-pair pj-in"><span class="pj-label">year</span><span class="pj-val">' + esc(a.year) + '</span></div>' +
                    '<div class="pj-hint pj-in"><i></i><span>' + (FINE ? 'Scroll or drag' : 'Swipe') + '</span></div>' +
                '</div>' +
            '</div>' +

            fig(0, false) +

            '<div class="pj-hang pj-spec" data-enter="spec">' +
                kick('project data') +
                '<div class="pj-stats">' + rows.map(function (r) {
                    return '<div class="pj-st' + (r[2] ? ' is-wide' : '') + '"><i></i>' +
                               '<span class="pj-m"><span class="pj-label">' + esc(r[0]) + '</span></span>' +
                               '<span class="pj-m"><span class="pj-st-v">' + r[1] + '</span></span>' +
                           '</div>';
                }).join('') + '</div>' +
            '</div>' +

            fig(1, false) +

            ((a.story || a.desc) ?   /* ADAPTED: left out when empty */
            '<div class="pj-hang pj-text pj-brief" data-enter="text">' +
                kick('the brief') +
                '<p class="pj-story">' + story(a) + '</p>' +
            '</div>' : '') +

            fig(2, true) +

            (a.desc ?
            '<div class="pj-hang pj-quote" data-enter="text">' +
                kick('in one line') +
                '<p class="pj-said">' + esc(a.desc) + '</p>' +
            '</div>' : '') +

            fig(3, false) +

            /* ADAPTED: the project's own approach and scope, no placeholder */
            ((a.notes.length || a.scope.length) ?
            '<div class="pj-hang pj-text pj-approach" data-enter="text">' +
                kick('approach') +
                a.notes.map(function (t) { return '<p class="pj-par">' + esc(t) + '</p>'; }).join('') +
                (a.scope.length ? '<ol class="pj-scope">' + a.scope.map(function (s, k) {
                    return '<li><span class="pj-m"><span><i>' + pad(k + 1) + '</i>' + esc(s) + '</span></span></li>';
                }).join('') + '</ol>' : '') +
            '</div>' : '') +

            fig(4, true) +

            '<div class="pj-hang pj-end" data-enter="end">' +
                '<button class="pj-nextb" type="button" data-pjnext="' + nxI + '">' +
                    kick('next project', '<span class="pj-no">' + esc(nx.no) + '</span>') +
                    '<span class="pj-name pj-foot-name">' + words(nx.title) + '</span>' +
                    '<span class="pj-go pj-in"><i></i><span>' + esc(nx.type) + '</span></span>' +
                '</button>' +
            '</div>';
        }

        function build() {
            root = document.createElement('div');
            root.className = 'pj' + (FINE ? ' is-fine' : '');
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            root.setAttribute('aria-labelledby', 'pjTitle');
            root.innerHTML =
                '<div class="pj-scroll"><div class="pj-track"></div></div>' +
                '<i class="pj-wipe" aria-hidden="true"></i>' +
                '<div class="pj-rail">' +
                    '<span class="pj-rail-no"></span>' +
                    '<span class="pj-rail-name"></span>' +
                    '<div class="pj-map" aria-hidden="true"><div class="pj-map-in"></div><i class="pj-map-win"></i></div>' +
                    '<span class="pj-rail-n"></span>' +
                    '<span class="pj-steps">' +
                        '<button class="pj-step" type="button" data-pjstep="-1" aria-label="Previous project"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M10 6 H2 M5.5 2.5 L2 6 L5.5 9.5"/></svg></button>' +
                        '<button class="pj-step" type="button" data-pjstep="1" aria-label="Next project"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6 H10 M6.5 2.5 L10 6 L6.5 9.5"/></svg></button>' +
                    '</span>' +
                    '<button class="pj-close" type="button" data-pjclose>Close</button>' +
                '</div>';
            ROOM.appendChild(root);
            scroller = q('.pj-scroll', root);
            track = q('.pj-track', root);
            wipe = q('.pj-wipe', root);
            railEl = q('.pj-rail', root);
            railNo = q('.pj-rail-no', root);
            railName = q('.pj-rail-name', root);
            railN = q('.pj-rail-n', root);
            map = q('.pj-map', root);
            mapIn = q('.pj-map-in', root);
            mapWin = q('.pj-map-win', root);
            setX = gsap.quickSetter(track, 'x', 'px');

            /* the wheel has no horizontal axis on a mouse, so the vertical
               one is remapped — and eased in the loop rather than written
               straight to the position, which reads as dragging a filmstrip */
            root.addEventListener('wheel', function (e) {
                if (e.ctrlKey) return;
                e.preventDefault();
                if (busy) return;
                var d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
                if (e.deltaMode === 1) d *= 32;
                if (!d) return;
                var now = performance.now();
                if (now < coolUntil) return;
                if ((d > 0 && target >= maxPos - 0.5) || (d < 0 && target <= 0.5)) { push(d, now); return; }
                over = 0;
                target = clamp(target + d * 1.15);
                wake();
            }, { passive: false });

            /* a phone keeps its own momentum: the native scroller stays and
               the loop follows it rather than fighting it */
            scroller.addEventListener('scroll', function () {
                if (driving || FINE) return;
                cur = target = scroller.scrollLeft;
                paint(cur);
            }, { passive: true });

            /* a press on the map takes the sheet there, centred on the press */
            map.addEventListener('click', function (e) {
                if (busy) return;
                var r = map.getBoundingClientRect();
                target = clamp((e.clientX - r.left) / r.width * total - VW / 2);
                if (!FINE) { scroller.scrollTo({ left: target, behavior: 'smooth' }); return; }
                wake();
            });

            /* ---- GRAB AND THROW: the pointer's speed over the last frames
               is carried into the target on release */
            if (FINE) {
                var down = false, startX = 0, startPos = 0, lastX = 0, vel = 0;
                scroller.addEventListener('pointerdown', function (e) {
                    if (e.button || busy) return;
                    down = true; vel = 0;
                    startX = lastX = e.clientX; startPos = target;
                    root.classList.add('is-drag');
                    scroller.setPointerCapture(e.pointerId);
                });
                scroller.addEventListener('pointermove', function (e) {
                    if (!down) return;
                    vel = vel * 0.72 + (lastX - e.clientX) * 0.28;
                    lastX = e.clientX;
                    target = clamp(startPos + (startX - e.clientX) * 1.2);
                    wake();
                });
                var up = function () {
                    if (!down) return;
                    down = false;
                    root.classList.remove('is-drag');
                    target = clamp(target + vel * 14);
                    wake();
                };
                scroller.addEventListener('pointerup', up);
                scroller.addEventListener('pointercancel', up);
                /* a drag is not a press on what is under it */
                scroller.addEventListener('click', function (e) {
                    if (Math.abs(lastX - startX) > 6) { e.preventDefault(); e.stopPropagation(); }
                }, true);
            }

            root.addEventListener('click', function (e) {
                if (e.target.closest('[data-pjclose]')) { close(); return; }
                var st = e.target.closest('[data-pjstep]');
                if (st && !busy) { var dir = +st.getAttribute('data-pjstep'); turn(wrapI(idx + dir), dir); return; }
                var nx = e.target.closest('[data-pjnext]');
                if (nx && !busy) turn(+nx.getAttribute('data-pjnext'), 1);
            });
        }

        function clamp(v) { return v < 0 ? 0 : (v > maxPos ? maxPos : v); }
        function wake() { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }

        /* THE GIVE. Pushing past an end moves the sheet a little further,
           less and less the harder it is pushed, and draws the line under
           the next project's name out as it goes; far enough, and it turns */
        function push(d, now) {
            if (over && (d > 0) !== (over > 0)) over = 0;
            over += d;
            overAt = now;
            var u = Math.min(1, Math.abs(over) / OVER);
            rub = (over > 0 ? 1 : -1) * RUB_MAX * (1 - Math.pow(1 - u, 2));
            if (goLine && over > 0) goLine.style.transform = 'scaleX(' + (0.35 + 0.65 * u).toFixed(3) + ')';
            if (u >= 1) {
                var dir = over > 0 ? 1 : -1;
                over = 0; coolUntil = now + 1300;
                turn(wrapI(idx + dir), dir);
                return;
            }
            wake();
        }

        /* ==============================================================
           MEASURE — once per sheet and per resize, never per frame
        ============================================================== */
        /* THE NAME, FITTED to its column: the longest word to the width,
           all its lines to the height the column has left, and never past
           the size the stylesheet sets */
        function fitName(h2, box, room) {
            h2.style.fontSize = '';
            var cap = parseFloat(getComputedStyle(h2).fontSize);
            h2.style.fontSize = '100px';
            var w = 0;
            qa('.pj-m > span', h2).forEach(function (s) { w = Math.max(w, s.scrollWidth); });
            var size = 100 * box / Math.max(1, w);
            if (room > 0) size = Math.min(size, 100 * room / Math.max(1, h2.offsetHeight));
            h2.style.fontSize = Math.max(24, Math.floor(Math.min(size, cap))) + 'px';
        }

        function measure() {
            VW = innerWidth; VH = innerHeight;
            var title = q('.pj-title', track);
            if (title) {
                var cs = getComputedStyle(title);
                var room = title.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) -
                           q('.pj-kick', title).offsetHeight - q('.pj-tfoot', title).offsetHeight - 56;
                fitName(q('.pj-name', title), title.clientWidth, room);
                var end = q('.pj-end', track);
                if (end) fitName(q('.pj-foot-name', end), end.clientWidth * 0.92, VH * 0.34);
            }
            splitLines(q('.pj-story', track));
            figs = qa('.pj-pic', track).map(function (el, k) {
                return { el: el, frame: q('.pj-frame', el), plate: q('.pj-plate', el), dev: q('.pj-dev', el),
                         off: el.offsetLeft, size: el.offsetWidth, k: k, e: -1, mg: -1, px: 1e9, map: null };
            });
            lazies = qa('img[data-src]', track).map(function (im) {
                var f = im.closest('.pj-pic');
                return { im: im, off: f.offsetLeft, size: f.offsetWidth, done: false };
            });
            enters = qa('[data-enter]', track).map(function (el) {
                return { el: el, type: el.getAttribute('data-enter'), off: el.offsetLeft };
            });
            maxPos = Math.max(0, track.scrollWidth - VW);
            buildMap();
        }

        /* THE MAP. The whole sheet at a hundred-odd pixels: every
           photograph a block that fills in as it develops, every block of
           words a hairline, and the window on it marked in the green */
        function buildMap() {
            total = track.scrollWidth || 1;
            MAPW = map.clientWidth || 1;
            var s = MAPW / total, h = '';
            Array.prototype.forEach.call(track.children, function (el) {
                var pic = el.classList.contains('pj-pic');
                h += '<b class="' + (pic ? 'is-pic' : 'is-word') + '" style="left:' + (el.offsetLeft * s).toFixed(2) +
                     'px;width:' + Math.max(1, el.offsetWidth * s).toFixed(2) + 'px"></b>';
            });
            mapIn.innerHTML = h;
            var pics = qa('.is-pic', mapIn);
            figs.forEach(function (f, i) { f.map = pics[i]; });
            mapWin.style.width = Math.max(4, VW * s).toFixed(2) + 'px';
        }

        /* ==============================================================
           THE ENTRANCES — one gesture a block, played once, as it comes
           on screen: a rule drawn, a line risen, a number counted
        ============================================================== */
        function hide() {
            if (REDUCED) return;
            gsap.set(qa('.pj-m > span', track), { yPercent: 112 });
            gsap.set(qa('.pj-in', track), { opacity: 0, y: 12 });
            gsap.set(qa('.pj-st > i', track), { scaleX: 0 });
        }
        function play(type, el, d) {
            if (REDUCED) return;
            var qq = function (s) { return qa(s, el); };
            var tl = gsap.timeline({ delay: d, defaults: { overwrite: 'auto' } });
            if (type === 'title' || type === 'end') {
                tl.to(qq('.pj-kick'), { opacity: 1, y: 0, duration: .7, ease: 'power3.out' }, 0)
                  .to(qq('.pj-name .pj-m > span'), { yPercent: 0, duration: 1.1, stagger: .07, ease: 'power4.out' }, .08)
                  .to(qq('.pj-tfoot .pj-in, .pj-go'), { opacity: 1, y: 0, duration: .8, stagger: .08, ease: 'power3.out' }, .45);
            } else if (type === 'spec') {
                tl.to(qq('.pj-kick'), { opacity: 1, y: 0, duration: .8, ease: 'power2.out' }, 0)
                  .to(qq('.pj-st > i'), { scaleX: 1, duration: 1.2, stagger: .05, ease: 'power2.inOut' }, .1)
                  .to(qq('.pj-st .pj-m > span'), { yPercent: 0, duration: 1, stagger: .035, ease: 'power3.out' }, .3);
                qq('.pj-num').forEach(function (num, i) {
                    var to = parseFloat(num.getAttribute('data-n'));
                    var dec = (num.getAttribute('data-n').split('.')[1] || '').length;
                    var o = { v: 0 };
                    num.textContent = (0).toFixed(dec);
                    tl.to(o, { v: to, duration: 1.6, ease: 'power3.out',
                        onUpdate: function () { num.textContent = o.v.toFixed(dec); } }, .4 + i * .08);
                });
            } else if (type === 'fig') {
                tl.to(qq('.pj-cap'), { opacity: 1, y: 0, duration: .8, ease: 'power3.out' }, .15);
            } else {
                tl.to(qq('.pj-kick'), { opacity: 1, y: 0, duration: .8, ease: 'power2.out' }, 0)
                  .to(qq('.pj-m > span'), { yPercent: 0, duration: 1, stagger: .06, ease: 'power3.out' }, .1)
                  .to(qq('.pj-par'), { opacity: 1, y: 0, duration: .9, stagger: .12, ease: 'power2.out' }, .2);
            }
        }

        /* ==============================================================
           ONE FRAME. The position is eased in tick(); everything below is
           arithmetic on offsets measured once, so a frame reads nothing.
        ============================================================== */
        function paint(X) {
            var i;
            if (FINE) setX(-(X + rub));
            mapWin.style.transform = 'translate3d(' + (X * MAPW / total).toFixed(2) + 'px,0,0)';

            for (i = 0; i < lazies.length; i++) {
                var l = lazies[i];
                if (!l.done && l.off - X < VW * 1.8 && l.off + l.size - X > -VW * 0.6) {
                    l.im.src = l.im.getAttribute('data-src');
                    l.done = true;
                }
            }

            var near = 0, nearD = 1e9;
            for (i = 0; i < figs.length; i++) {
                var f = figs[i];
                var s = f.off - X, c = s + f.size / 2;
                if (Math.abs(c - VW / 2) < nearD) { nearD = Math.abs(c - VW / 2); near = i; }
                /* DEVELOPED by its centre: still in the dark at the right
                   edge, fully up once it is a little left of the middle */
                var mg = REDUCED ? 1 : Math.min(1, Math.max(0, (VW * 0.98 - c) / (VW * 0.52)));
                if (s < VW && s + f.size > 0 && !REDUCED) {
                    /* the frame opens as the picture comes up */
                    var e = mg * mg * (3 - 2 * mg);
                    if (Math.abs(e - f.e) > 0.002) {
                        var a = ((1 - e) * 7).toFixed(2), b = ((1 - e) * 4.5).toFixed(2);
                        f.frame.style.clipPath = 'inset(' + a + '% ' + b + '% ' + a + '% ' + b + '%)';
                        f.e = e;
                    }
                    /* and the picture runs a little against the page */
                    var px = Math.max(-1, Math.min(1, (c - VW / 2) / VW)) * -6;
                    if (Math.abs(px - f.px) > 0.01) {
                        f.plate.style.transform = 'translate3d(' + px.toFixed(2) + '%,0,0) scale(' + (1.14 - 0.06 * e).toFixed(4) + ')';
                        f.px = px;
                    }
                }
                if (Math.abs(mg - f.mg) > 0.002) {
                    f.dev.style.opacity = ((1 - mg) * 0.86).toFixed(3);
                    if (f.map) f.map.style.opacity = (0.22 + 0.78 * mg).toFixed(3);
                    f.mg = mg;
                }
            }
            if (near !== shownN) { shownN = near; railN.innerHTML = '<b>' + pad(near + 1) + '</b> / ' + pad(nShots); }

            if (busy) return;
            for (i = 0; i < enters.length; i++) {
                var en = enters[i];
                if (!en.el.__pjIn && en.off - X < VW * 0.88) {
                    en.el.__pjIn = true;
                    play(en.type, en.el, openDelay);
                }
            }
            openDelay = 0;
        }

        function tick(now) {
            raf = 0;
            /* FRAME-RATE INDEPENDENT: the retention is raised to the
               elapsed time, so the curve is a property of the seconds it
               takes rather than of the screen's refresh */
            var t = now || performance.now();
            var dt = last ? Math.min(0.064, (t - last) / 1000) : 1 / 60;
            last = t;
            cur += (target - cur) * (1 - Math.pow(0.0012, dt));
            if (Math.abs(target - cur) < 0.35) cur = target;
            if (rub !== 0 && !busy && t - overAt > 140) {
                rub *= Math.pow(0.0004, dt);
                over *= Math.pow(0.0004, dt);
                if (Math.abs(rub) < 0.3) { rub = 0; over = 0; }
                if (goLine) goLine.style.transform = rub > 0 ? 'scaleX(' + (0.35 + 0.65 * rub / RUB_MAX).toFixed(3) + ')' : '';
            }
            if (!FINE) { driving = true; scroller.scrollLeft = cur; driving = false; }
            paint(cur);
            if (cur !== target || rub !== 0) raf = requestAnimationFrame(tick);
            else last = 0;
        }

        /* ---- A PROJECT INTO THE SHEET ---------------------------------- */
        function show(i, atEnd) {
            var a = M.wall[i]; if (!a) return;
            idx = i;
            rub = over = 0;
            track.innerHTML = sheet(a, i);
            goLine = q('.pj-go i', track);
            railNo.textContent = a.no;
            railName.innerHTML = esc(a.title) + '<span>' + esc(a.place) + '</span>';
            shownN = -1;
            cur = target = 0;
            if (FINE) setX(0);
            else { driving = true; scroller.scrollLeft = 0; driving = false; }
            hide();
            /* measured only once the room is displayed: a display:none
               subtree reports every offset as zero */
            if (!root.classList.contains('on')) return;
            measure();
            /* ENTERED BACKWARD it is entered at its end, already read:
               everything on it stands finished */
            if (atEnd) {
                cur = target = maxPos;
                if (!FINE) { driving = true; scroller.scrollLeft = cur; driving = false; }
                if (!REDUCED) {
                    gsap.set(qa('.pj-m > span', track), { yPercent: 0 });
                    gsap.set(qa('.pj-in', track), { opacity: 1, y: 0 });
                    gsap.set(qa('.pj-st > i', track), { scaleX: 1 });
                }
                enters.forEach(function (en) { en.el.__pjIn = true; });
            }
            paint(cur);
        }

        /* ---- THE TURN to another project: a plate of the ground crosses
           the sheet from the right, the project is changed under it, and
           it leaves to the left over the new one ---- */
        function turn(i, dir) {
            if (busy) return;
            busy = true;
            dir = dir < 0 ? -1 : 1;
            /* forward the plate comes in from the right and leaves to the
               left; backward, the other way round */
            var IN = dir > 0 ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)';
            var OUT = dir > 0 ? 'inset(0% 100% 0% 0%)' : 'inset(0% 0% 0% 100%)';
            gsap.timeline()
                .fromTo(wipe, { clipPath: IN, visibility: 'visible' },
                    { clipPath: 'inset(0% 0% 0% 0%)', duration: .62, ease: 'power4.inOut' })
                .to(scroller, { x: -dir * VW * 0.08, duration: .62, ease: 'power4.in' }, 0)
                .to(railName, { opacity: 0, duration: .25, ease: 'power2.in' }, 0)
                .add(function () { show(i, dir < 0); })
                .fromTo(scroller, { x: dir * VW * 0.08 }, { x: 0, duration: 1, ease: 'power3.out', immediateRender: false }, '+=.06')
                .to(wipe, { clipPath: OUT, duration: .72, ease: 'power4.inOut' }, '<')
                .to(railName, { opacity: 1, duration: .5, ease: 'power2.out' }, '<.3')
                .add(function () { busy = false; openDelay = .12; paint(cur); }, '<-.1')
                .set(wipe, { visibility: 'hidden' }, '>');
        }

        /* ---- OPEN. The photograph is already on screen inside the wall's
                composition, so the room runs out of that exact rectangle */
        function rectInset(r) {
            return 'inset(' + r.top.toFixed(1) + 'px ' + (innerWidth - r.right).toFixed(1) + 'px ' +
                   (innerHeight - r.bottom).toFixed(1) + 'px ' + r.left.toFixed(1) + 'px)';
        }
        function openFrom(i, fromEl) {
            if (!root) build();
            show(i);
            root.classList.add('on');
            ROOM.classList.add('pj-open');
            measure();
            wasLocked = !!(lenis && lenis.isStopped);
            scrollLock(true);

            fromRect = fromEl ? fromEl.getBoundingClientRect() : null;
            openDelay = .42;
            paint(0);
            gsap.timeline()
                .fromTo(root, { clipPath: fromRect ? rectInset(fromRect) : 'inset(50% 50% 50% 50%)' },
                    { clipPath: 'inset(0px 0px 0px 0px)', duration: .8, ease: 'power4.inOut' }, 0)
                .fromTo(scroller, { x: VW * 0.06 }, { x: 0, duration: 1.2, ease: 'power3.out' }, 0)
                .fromTo(railEl, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: .6, ease: 'power3.out' }, .5);
            addEventListener('keydown', keys);
        }

        function close() {
            if (!root || !root.classList.contains('on') || busy) return;
            busy = true;
            removeEventListener('keydown', keys);
            gsap.timeline({
                onComplete: function () {
                    busy = false;
                    root.classList.remove('on');
                    ROOM.classList.remove('pj-open');
                    track.innerHTML = '';
                    gsap.set(root, { clearProps: 'clipPath' });
                    if (!wasLocked) scrollLock(false);
                    if (closing) { var c = closing; closing = null; c(); }
                }
            })
                .to(railEl, { y: 12, opacity: 0, duration: .26, ease: 'power2.in' }, 0)
                .to(root, { clipPath: fromRect ? rectInset(fromRect) : 'inset(50% 50% 50% 50%)',
                    duration: .62, ease: 'power4.inOut' }, .08);
        }

        function keys(e) {
            if (!root || !root.classList.contains('on')) return;
            if (e.key === 'Escape') { close(); return; }
            if (busy) return;
            var step = VW * 0.72, moved = true;
            var fwd = e.key === 'ArrowRight' || e.key === 'PageDown';
            var back = e.key === 'ArrowLeft' || e.key === 'PageUp';
            if (fwd && target >= maxPos - 0.5) { e.preventDefault(); turn(wrapI(idx + 1), 1); return; }
            if (back && target <= 0.5) { e.preventDefault(); turn(wrapI(idx - 1), -1); return; }
            if (fwd) target = clamp(target + step);
            else if (back) target = clamp(target - step);
            else if (e.key === 'Home') target = 0;
            else if (e.key === 'End') target = clamp(1e7);
            else moved = false;
            if (!moved) return;
            e.preventDefault();
            if (!FINE) { scroller.scrollTo({ left: target, behavior: 'smooth' }); return; }
            wake();
        }

        addEventListener('resize', function () {
            if (!root || !root.classList.contains('on')) return;
            measure();
            cur = target = clamp(cur);
            if (!FINE) scroller.scrollLeft = cur;
            figs.forEach(function (f) { f.e = f.mg = -1; f.px = 1e9; });
            paint(cur);
        });

        window.__pjState = function () { return { idx: idx, cur: cur, target: target, maxPos: maxPos, over: over, rub: rub, busy: busy }; };

        /* ADAPTED: the live preview. The open project is rebuilt from the
           new data where it stands: what has been read stays finished,
           what is still to the right will arrive the way it always does. */
        function finish(el) {
            if (REDUCED) return;
            gsap.set(qa('.pj-m > span', el), { yPercent: 0 });
            gsap.set(qa('.pj-in', el), { opacity: 1, y: 0 });
            gsap.set(qa('.pj-st > i', el), { scaleX: 1 });
        }
        window.__cxRefresh = function (id) {
            if (!root || !root.classList.contains('on') || busy) return false;
            var i = window.__cxIndexOf(id);
            if (i < 0) i = Math.min(idx, M.wall.length - 1);
            var a = M.wall[i]; if (!a) return false;
            var keep = cur;
            idx = i;
            track.innerHTML = sheet(a, i);
            goLine = q('.pj-go i', track);
            railNo.textContent = a.no;
            railName.innerHTML = esc(a.title) + '<span>' + esc(a.place) + '</span>';
            shownN = -1;
            hide();
            measure();
            cur = target = clamp(keep);
            if (FINE) setX(-cur);
            else { driving = true; scroller.scrollLeft = cur; driving = false; }
            enters.forEach(function (en) {
                if (en.off - cur < VW * 0.88) { finish(en.el); en.el.__pjIn = true; }
            });
            paint(cur);
            return true;
        };
        window.__cxIsOpen = function () { return !!(root && root.classList.contains('on')); };
        return function (i, fromEl, onClose) { closing = onClose || null; openFrom(i, fromEl); };
    })();
    /* for the harness: open project i without the wall */
    window.__cxProject = function (i) { openProject(i || 0, null); };
    /* ADAPTED: open project i, and be told when it is closed */
    window.__cxOpen = function (i, onClose) { openProject(i || 0, null, onClose); };
})();
