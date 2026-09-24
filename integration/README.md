# Legarea y-final de Opunto Studio

Studio publică proiectele la `/api/public/*`. În y-final se schimbă doar sursa datelor: animațiile, layout-ul și paginile de proiect rămân cele de acum. Pagina de preview din Studio folosește exact fișierele de mai jos, deci ce vezi în preview e ce apare pe site.

## Fișiere de copiat în `zx-final/`

| Din Studio | În y-final |
|---|---|
| `integration/opunto-feed.js` | `js/opunto-feed.js` (nou) |
| `preview/js/project-page.js` | înlocuiește `js/project-page.js` |
| stilurile `.pv-gate` din `preview/css/preview.css` | adaugă-le în `css/project-page.css` (ecranul de parolă) |

## #arch

În `y-final.html`:

1. Scoate `js/project-data.js` și `js/project-sample.js`.
2. Golește conținutul lui `<div class="pf-track" id="pfTrack">`. Cardurile vor veni din Studio.
3. Înainte de `js/subsite-arch-x.js`, adaugă:

```html
<script src="js/opunto-feed.js"></script>
<script>
  window.__opunto = OpuntoFeed.init({ api: 'https://studio.opunto.ro' });
</script>
```

4. După `js/project-page.js`, adaugă:

```html
<script>
  window.__opunto.then(function () { OpuntoFeed.mountArch(); });
</script>
```

5. Singura condiție pentru `subsite-arch-x.js`: strip-ul (`buildStrip` / `initStrip`) trebuie să citească `.wk-card` după ce au fost puse în pagină. Dacă îl inițializează la load, pornește-l în `window.__opunto.then(...)`, după `mountArch()`.

`mountArch()` face trei lucruri:
- scrie cardurile în `#pfTrack`, în ordinea din Studio, cu mărimile alese (`wk-card--wide/mid/slim`);
- scrie lista de nume în `.colophon-names`;
- dă proiectele paginii de proiect.

Un card protejat cere parola înainte să se deschidă.

## #concepts

`js/concepts-x.js` construiește peretele din `M.wall`. Ca să citească din Studio:

1. Construirea peretelui trebuie să aștepte datele: `window.__opunto.then(...)`.
2. Setează `M.wall = OpuntoFeed.wall();`. Rezultatul are 15 poziții (A1…C5), cu exact câmpurile pe care le folosește deja `concepts-x.js`: `src, shots, tag, no, facts, story, desc, title, place, year, type, hero`, plus `notes`, `scope` și `sm`.
3. În `cell()`, schimbă `small(it.src)` în `it.sm || small(it.src)`, ca peretele să încarce miniaturile.
4. Modulul `openProject` poate fi înlocuit cu `preview/js/concepts-page.js`. Varianta adaptată nu mai folosește pozele de rezervă și textele placeholder.

## Proiecte protejate

- `OpuntoFeed.isLocked(id)` spune dacă un proiect cere parola.
- `OpuntoFeed.gate(id, then)` afișează ecranul de parolă.
- După deblocare, datele se reîncarcă cu conținutul complet, iar tokenul ține cât e deschis tab-ul.

## Setări pe server

În `.env`-ul Studio-ului, `PUBLIC_ORIGINS=https://opunto.ro` restrânge cine poate citi API-ul public din browser. Implicit, `*` permite oricui.
