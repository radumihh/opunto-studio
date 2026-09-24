/* ==================================================================
   THE PREVIEW HARNESS — shared by preview/arch.html and
   preview/concepts.html.

   Reads the projects from the server (saved ones, with any unsaved edit
   from an open editor laid over them), hands them to the site's own
   project page, and draws the start screen the page opens out of: the
   strip of cards for architecture, the wall for concepts.

   Address:  ?id=<project>   open that project on load
             ?visitor=1      see it as a visitor: published only, and a
                             protected project asks for the password
   Live:     the admin posts { type: 'changed' | 'open', site, id } on
             the BroadcastChannel 'opunto-preview'; the open page is
             re-rendered where it stands, nothing reloads.
   ================================================================== */
(function () {
    'use strict';

    var SITE = document.body.getAttribute('data-site');
    var ARCH = SITE === 'arch';
    var params = new URLSearchParams(location.search);
    var wantId = params.get('id');
    var visitor = params.get('visitor') === '1';
    var projects = [], hasPassword = false;
    /* unlocked for this page only: the studio's "Vizitator" should meet
       the gate every time it is switched on */
    var unlocked = false;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function byId(id) { for (var i = 0; i < projects.length; i++) if (projects[i].id === id) return projects[i]; return null; }

    function load() {
        return fetch('/api/preview/data?site=' + SITE, { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                hasPassword = j.hasPassword;
                projects = j.projects.filter(function (p) {
                    return !visitor || p.status === 'published' || p.id === wantId;
                });
                if (ARCH) window.__ppSetProjects(projects);
                else window.__cxSetProjects(projects);
                drawStart();
            });
    }

    /* ---------------------------------------------------------------
       THE START SCREEN
    --------------------------------------------------------------- */
    var CAT_NAMES = { 'architecture': 'Architecture', 'interior-design': 'Interior Design', 'real-estate-marketing': 'Real Estate Marketing' };
    var SETS = ['architecture', 'interior-design', 'real-estate-marketing'];
    var shownCat = null;

    function drawStart() {
        if (ARCH) drawStrip(); else drawWall();
    }

    function drawStrip() {
        var track = document.getElementById('pfTrack');
        var want = byId(wantId);
        /* the room of the project being edited, even after its category changes */
        if (want) shownCat = want.category;
        else if (!shownCat) shownCat = params.get('cat') || 'architecture';
        var html = '';
        SETS.forEach(function (cat, set) {
            var n = 0;
            projects.filter(function (p) { return p.category === cat; }).forEach(function (p) {
                n++;
                var photos = p.photos || [];
                var ph = photos[((p.card && p.card.photo) || 1) - 1] || photos[0];
                var size = (p.card && p.card.size) || 'wide';
                html += '<a class="wk-card wk-card--' + size + '" href="#" data-set="' + set + '" data-pid="' + p.id + '">' +
                            '<div class="wk-spine" aria-hidden="true"><span class="wk-n">' + pad(n) + '</span><span>' + esc(p.name || 'Untitled') + '</span></div>' +
                            '<div class="wk-frame">' +
                                (p.status !== 'published' ? '<span class="wk-lock wk-draft">Draft</span>' : (p.protected ? '<span class="wk-lock">Locked</span>' : '')) +
                                '<div class="fg-shot">' + (ph ? '<img class="fg-img" src="' + ph.src + '" alt="' + esc(p.name) + '" />' : '') + '</div>' +
                            '</div>' +
                        '</a>';
            });
        });
        track.innerHTML = html;
        var set = SETS.indexOf(shownCat);
        track.setAttribute('data-set', String(set));
        var count = projects.filter(function (p) { return p.category === shownCat; }).length;
        document.getElementById('pvCat').textContent = CAT_NAMES[shownCat] || '';
        document.getElementById('pvCount').textContent = count + (count === 1 ? ' project' : ' projects');
    }

    function drawWall() {
        var grid = document.getElementById('pvGrid');
        var html = '', ROWS = 'ABC';
        for (var r = 0; r < 3; r++) {
            for (var c = 1; c <= 5; c++) {
                var slot = ROWS[r] + c, i = -1;
                for (var k = 0; k < projects.length; k++) if (projects[k].wallSlot === slot) { i = k; break; }
                var p = projects[i];
                if (!p) { html += '<div class="pv-cell is-empty"><b>' + slot + '</b></div>'; continue; }
                var ph = (p.photos || [])[0];
                html += '<div class="pv-cell' + (p.id === wantId ? ' is-current' : '') + '" data-i="' + i + '" data-pid="' + p.id + '">' +
                            (ph ? '<img src="' + (ph.sm || ph.src) + '" alt="" />' : '') +
                            '<b>' + slot + '</b>' +
                            (p.status !== 'published' ? '<span class="pv-flag">Draft</span>' : (p.wallHero ? '<span class="pv-flag is-hero">Hero</span>' : '')) +
                            '<div class="pv-info"><span class="y">' + esc(p.year) + '</span><span class="n">' + esc(p.title || 'Untitled') + '</span><span class="p">' + esc(p.place) + '</span></div>' +
                        '</div>';
            }
        }
        grid.innerHTML = html;
        var loose = projects.filter(function (p) { return !p.wallSlot; });
        var wall = grid.parentNode, old = wall.querySelector('.pv-loose');
        if (old) old.remove();
        if (loose.length) {
            var div = document.createElement('div');
            div.className = 'pv-loose';
            div.innerHTML = '<span>Not on the wall:</span>' + loose.map(function (p) {
                return '<button type="button" data-pid="' + p.id + '">' + esc(p.title || 'Untitled') + '</button>';
            }).join('');
            wall.appendChild(div);
        }
        document.getElementById('pvCount').textContent = projects.length + (projects.length === 1 ? ' project' : ' projects');
    }

    /* ---------------------------------------------------------------
       OPENING — through the gate when a visitor meets a locked project
    --------------------------------------------------------------- */
    function isOpen() { return ARCH ? window.__ppIsOpen() : window.__cxIsOpen(); }

    function open(id) {
        var p = byId(id);
        if (!p) return;
        if (visitor && p.protected && !unlocked) { gate(p); return; }
        if (isOpen()) { refresh(id); return; }
        if (ARCH) {
            if (p.category !== shownCat) { shownCat = p.category; drawStrip(); }
            var card = document.querySelector('#pfTrack .wk-card[data-pid="' + id + '"]');
            if (!card) return;
            card.scrollIntoView({ inline: 'center', block: 'nearest' });
            requestAnimationFrame(function () { window.__openProject(card); });
        } else {
            var i = window.__cxIndexOf(id);
            if (i >= 0) window.__cxOpen(i, null);
        }
    }

    /* the page ignores a refresh while it is mid-animation (opening,
       turning); the newest one waits and is tried again until it lands */
    var retry = 0;
    function refresh(id, tries) {
        clearTimeout(retry);
        if (!isOpen()) return;
        var ok = ARCH ? window.__ppRefresh(id || window.__ppCurrent()) : window.__cxRefresh(id || null);
        tries = tries || 0;
        if (!ok && tries < 24) retry = setTimeout(function () { refresh(id, tries + 1); }, 250);
    }

    /* on window, in the capture phase: ahead of the page's own card
       listener on the document, so a locked card meets the gate first */
    window.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('[data-pid]');
        if (!t || isOpen()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        open(t.getAttribute('data-pid'));
    }, true);

    /* ---- THE GATE ----------------------------------------------------- */
    function gate(p) {
        var name = ARCH ? p.name : p.title;
        var el = document.createElement('div');
        el.className = 'pv-gate';
        el.innerHTML =
            '<form autocomplete="off">' +
                '<div class="g-kick"><span>Protected project</span><span>' + esc(ARCH ? CAT_NAMES[p.category] : p.type) + '</span></div>' +
                '<h2>' + esc(name || 'Untitled') + '</h2>' +
                '<div class="g-row"><input type="password" name="pw" placeholder="Password" aria-label="Password" />' +
                '<button type="submit">Open <span aria-hidden="true">→</span></button></div>' +
                '<div class="g-err" role="alert">' + (hasPassword ? '' : 'No password is set yet — set one in Settings.') + '</div>' +
                '<button type="button" class="g-back">← Back</button>' +
            '</form>';
        document.body.appendChild(el);
        requestAnimationFrame(function () { el.classList.add('on'); });
        var input = el.querySelector('input'), err = el.querySelector('.g-err');
        setTimeout(function () { input.focus(); }, 60);
        function shut() { el.classList.remove('on'); setTimeout(function () { el.remove(); }, 500); }
        el.querySelector('.g-back').addEventListener('click', shut);
        el.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            fetch('/api/public/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: input.value }) })
                .then(function (r) {
                    if (!r.ok) throw new Error('bad');
                    unlocked = true;
                    shut();
                    setTimeout(function () { open(p.id); }, 250);
                })
                .catch(function () {
                    err.textContent = 'Wrong password';
                    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
                    input.select();
                });
        });
    }

    /* ---------------------------------------------------------------
       LIVE — the admin says something changed
    --------------------------------------------------------------- */
    var pending = null, busyLoad = false;
    function onChanged(msg) {
        if (busyLoad) { pending = msg; return; }
        busyLoad = true;
        load().then(function () {
            if (msg.type === 'open' && msg.id) open(msg.id);
            else refresh(msg.id && isOpen() && msg.id === currentId() ? msg.id : null);
        }).finally(function () {
            busyLoad = false;
            if (pending) { var m = pending; pending = null; onChanged(m); }
        });
    }
    function currentId() {
        if (ARCH) return window.__ppCurrent();
        var st = window.__pjState && window.__pjState();
        return st && projects[st.idx] ? projects[st.idx].id : null;
    }
    if ('BroadcastChannel' in window) {
        new BroadcastChannel('opunto-preview').onmessage = function (e) {
            var m = e.data || {};
            if (m.site && m.site !== SITE) return;
            onChanged(m);
        };
    }
    /* and from a parent frame, for browsers without BroadcastChannel */
    addEventListener('message', function (e) {
        if (e.origin !== location.origin) return;
        var m = e.data || {};
        if (m && m.__opunto && (!m.site || m.site === SITE)) onChanged(m);
    });

    load().then(function () {
        if (!projects.length) {
            var d = document.createElement('div');
            d.className = 'pv-empty';
            d.innerHTML = '<p>No projects yet.</p>';
            document.body.appendChild(d);
            return;
        }
        if (wantId) setTimeout(function () { open(wantId); }, 120);
    });
})();
