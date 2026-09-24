/* ==================================================================
   OPUNTO FEED — the live site's side of Opunto Studio.

   Reads the published projects from the studio's public API and hands
   them to y-final in the shapes y-final already uses:

     #arch      the .wk-card strip (#pfTrack), the colophon names, and
                the project page (preview/js/project-page.js from the
                studio, which replaces zx-final/js/project-page.js)
     #concepts  M.wall entries for js/concepts-x.js, in wall order
     protected  a locked project opens only after the shared password;
                the token is kept for the browser session

   Usage (see integration/README.md):
       <script src="opunto-feed.js"></script>
       OpuntoFeed.init({ api: 'https://studio.opunto.ro' })
           .then(() => OpuntoFeed.mountArch());
   ================================================================== */
(function () {
    'use strict';

    var API = '';
    var TOKEN_KEY = 'opunto-unlock';
    var data = { arch: [], concepts: [], categories: [] };

    function token() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
    function abs(u) { return u && u.charAt(0) === '/' ? API + u : u; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function pad(n) { return (n < 10 ? '0' : '') + n; }

    /* every image path made absolute, so the site can live on another host */
    function absolutize(v) {
        if (Array.isArray(v)) return v.map(absolutize);
        if (!v || typeof v !== 'object') return v;
        var o = {};
        for (var k in v) o[k] = (k === 'src' || k === 'sm') ? abs(v[k]) : absolutize(v[k]);
        return o;
    }

    function get(path) {
        var h = token() ? { 'X-Unlock': token() } : {};
        return fetch(API + path, { headers: h }).then(function (r) {
            if (!r.ok) throw new Error('Opunto feed: ' + r.status + ' ' + path);
            return r.json();
        }).then(absolutize);
    }

    function load() {
        return Promise.all([get('/api/public/arch'), get('/api/public/concepts'), get('/api/public/arch/categories')])
            .then(function (r) { data.arch = r[0]; data.concepts = r[1]; data.categories = r[2]; return data; });
    }

    /* ---------------------------------------------------------------
       #arch
    --------------------------------------------------------------- */
    /* y-final's set numbers: 0 architecture, 1 interior, 2 real estate */
    var SETS = ['architecture', 'interior-design', 'real-estate-marketing'];
    /* the order the strip prints them in, as y-final does */
    var PRINT = ['interior-design', 'architecture', 'real-estate-marketing'];

    function cardHTML(p, n) {
        var photos = p.photos || [];
        var ph = photos[((p.card && p.card.photo) || 1) - 1] || photos[0];
        var size = (p.card && p.card.size) || 'wide';
        return '<a class="wk-card wk-card--' + size + '" href="#" data-set="' + SETS.indexOf(p.category) + '" data-pid="' + esc(p.id) + '"' +
                   (p.locked ? ' data-locked="1"' : '') + '>' +
                   '<div class="wk-spine" aria-hidden="true"><span class="wk-n">' + pad(n) + '</span><span>' + esc(p.name) + '</span></div>' +
                   '<div class="wk-frame"><div class="fg-shot">' +
                       (ph ? '<img class="fg-img" src="' + esc(ph.src) + '" alt="' + esc(ph.alt || p.name) + '" loading="lazy" />' : '') +
                   '</div></div>' +
               '</a>';
    }

    /* fills the strip and the colophon, and hands the projects to the
       project page. Options: track (#pfTrack), colophon (.colophon-names),
       count (.colophon-count, gets "N projects since …" only if given a
       function) */
    function mountArch(opt) {
        opt = opt || {};
        var track = opt.track || document.getElementById('pfTrack');
        if (typeof window.__ppSetProjects === 'function') window.__ppSetProjects(data.arch);
        if (track) {
            var html = '';
            PRINT.forEach(function (cat) {
                var n = 0;
                data.arch.filter(function (p) { return p.category === cat; })
                    .forEach(function (p) { html += cardHTML(p, ++n); });
            });
            track.innerHTML = html;
        }
        var names = opt.colophon || document.querySelector('.colophon-names');
        if (names) {
            names.textContent = data.arch.filter(function (p) { return p.inNameList !== false; })
                .map(function (p) { return (p.listName || p.name) + '.'; }).join(' ');
        }
        if (typeof opt.count === 'function') {
            var el = document.querySelector('.colophon-count');
            if (el) el.textContent = opt.count(data.arch.length);
        }
        return data.arch;
    }

    /* ---------------------------------------------------------------
       #concepts — M.wall entries, fifteen seats in reading order
    --------------------------------------------------------------- */
    function paras(t) {
        return String(t || '').split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    function wall() {
        var seats = new Array(15);
        data.concepts.forEach(function (p, i) {
            if (!p.wallSlot) return;
            var k = 'ABC'.indexOf(p.wallSlot[0]) * 5 + (+p.wallSlot[1] - 1);
            var photos = p.photos || [];
            seats[k] = {
                id: p.id,
                src: photos[0] ? photos[0].src : '',
                sm: photos[0] ? (photos[0].sm || photos[0].src) : '',
                shots: photos.slice(1).map(function (ph) { return ph.src; }),
                tag: p.wallSlot,
                no: String(i + 1).padStart(3, '0'),
                facts: (p.facts || []).map(function (f) { return [f.label, f.value]; }),
                story: p.story || '',
                desc: p.summary || '',
                title: p.title || '',
                place: p.place || '',
                year: p.year || '',
                type: p.type || '',
                notes: paras(p.approach),
                scope: p.scope || [],
                hero: p.wallHero ? 1 : undefined,
                locked: !!p.locked
            };
        });
        return seats;
    }

    /* ---------------------------------------------------------------
       PROTECTED PROJECTS
    --------------------------------------------------------------- */
    function unlock(password) {
        return fetch(API + '/api/public/unlock', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password })
        }).then(function (r) {
            return r.json().then(function (j) {
                if (!r.ok) throw new Error(j.error || 'Wrong password');
                try { sessionStorage.setItem(TOKEN_KEY, j.token); } catch (e) {}
                return load();
            });
        });
    }
    function isLocked(id) {
        var all = data.arch.concat(data.concepts);
        for (var i = 0; i < all.length; i++) if (all[i].id === id) return !!all[i].locked;
        return false;
    }

    /* A PRESS ON A LOCKED CARD asks for the password first. Runs on
       window in the capture phase, ahead of the page's own listener; the
       gate uses the .pv-gate styles from the studio's preview.css. */
    var guarded = false;
    function guardArch() {
        if (guarded) return;
        guarded = true;
        window.addEventListener('click', function (e) {
            var card = e.target.closest && e.target.closest('#pfStrip .wk-card[data-locked]');
            if (!card) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            gate(card.getAttribute('data-pid'), function () {
                mountArch();
                var fresh = document.querySelector('#pfStrip .wk-card[data-pid="' + card.getAttribute('data-pid') + '"]');
                if (fresh && window.__openProject) window.__openProject(fresh);
            });
        }, true);
    }
    function gate(id, then) {
        var p = data.arch.concat(data.concepts).filter(function (x) { return x.id === id; })[0] || {};
        var el = document.createElement('div');
        el.className = 'pv-gate';
        el.innerHTML = '<form autocomplete="off"><div class="g-kick"><span>Protected project</span><span></span></div>' +
            '<h2>' + esc(p.name || p.title || '') + '</h2>' +
            '<div class="g-row"><input type="password" placeholder="Password" aria-label="Password" />' +
            '<button type="submit">Open <span aria-hidden="true">→</span></button></div>' +
            '<div class="g-err" role="alert"></div><button type="button" class="g-back">← Back</button></form>';
        document.body.appendChild(el);
        requestAnimationFrame(function () { el.classList.add('on'); });
        var input = el.querySelector('input'), err = el.querySelector('.g-err');
        setTimeout(function () { input.focus(); }, 60);
        function shut() { el.classList.remove('on'); setTimeout(function () { el.remove(); }, 500); }
        el.querySelector('.g-back').addEventListener('click', shut);
        el.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            unlock(input.value).then(function () { shut(); setTimeout(then, 250); })
                .catch(function (x) { err.textContent = x.message; input.select(); });
        });
    }

    window.OpuntoFeed = {
        init: function (opt) { API = String((opt && opt.api) || '').replace(/\/$/, ''); return load(); },
        load: load,
        data: function () { return data; },
        mountArch: function (opt) { var r = mountArch(opt); guardArch(); return r; },
        wall: wall,
        unlock: unlock,
        isLocked: isLocked,
        gate: gate
    };
})();
