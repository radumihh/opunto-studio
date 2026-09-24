# Opunto Studio

Adminul pentru proiectele de pe site-urile Opunto, **#arch** și **#concepts**. Aici adaugi, editezi, reordonezi și ștergi proiecte. Pozele se optimizează automat. Preview-ul folosește **aceeași pagină de proiect ca site-ul**, nu o imitație.

## Pornire

```bash
npm install
npm run dev
```

- Aplicația rulează pe http://localhost:5173 (Vite, reîncărcare live).
- Serverul rulează pe http://127.0.0.1:4100 (API, poze și paginile de preview).

Pentru utilizare zilnică, fără Vite:

```bash
npm run build
npm start
```

Apoi deschide http://127.0.0.1:4100.

Serverul ascultă doar pe `127.0.0.1`. Ca să îl pui pe alt calculator sau pe un server, setează o parolă de admin:

```bash
HOST=0.0.0.0 ADMIN_PASSWORD=ceva-lung npm start
```

## Ce face

| | |
|---|---|
| **Proiecte** | Creezi, editezi, duplici și ștergi proiecte. Trage cardurile ca să schimbi ordinea din site. Poți filtra după categorie și stare și poți căuta după nume. |
| **Poze** | Le tragi în pagină sau le alegi din calculator (JPG, PNG, WebP, HEIC, până la 60 MB fiecare). Vezi progresul la fiecare poză și le reordonezi prin drag. Din meniul fiecărei poze alegi coperta, poza de pe card, un spațiu mai mare înaintea ei și textul alternativ (alt). |
| **Optimizare** | Fiecare poză devine `uploads/<id>.avif`: maxim 2560px pe latura lungă, AVIF la calitate 60, care arată ca un WebP la 85+ și e cu ~⅓ mai mic. Se generează și `uploads/<id>.sm.webp` de 720px pentru miniaturi. Originalul nu se păstrează. |
| **Preview live** | În dreapta editorului rulează pagina reală a site-ului, la mărimea reală (desktop 1440, laptop 1280, telefon 390), micșorată cât să încapă. Fiecare modificare apare în ~0.3s, fără reîncărcare, în locul în care ai rămas cu scroll-ul. Butonul „tab nou” o deschide pe tot ecranul. |
| **Parolă** | O singură parolă, setată în **Setări**. În fiecare proiect doar activezi sau dezactivezi protecția. Modul **Vizitator** din preview arată exact ce vede publicul, inclusiv ecranul de parolă. |
| **Publicare** | Un draft se salvează oricum. „Publicat” cere conținutul minim, iar ce lipsește apare deasupra formularului și lângă fiecare câmp. |

## Structură

```
server.js              API + poze + preview + aplicația compilată
lib/store.js           baza de date = data/db.json (scriere atomică, serializată)
lib/images.js          optimizarea pozelor (sharp) și ștergerea celor nefolosite
lib/validate.js        validare după schema/*.json, mesaje în română
lib/lock.js            parola comună (scrypt) și tokenurile vizitatorilor
schema/                modelele JSON: arch-project, concepts-project, photo
preview/               paginile de proiect ale site-ului, alimentate din bază
  js/project-page.js   = zx-final/js/project-page.js, adaptat (marcat ADAPTED)
  js/concepts-page.js  = modulul openProject din zx-final/js/concepts-x.js, adaptat
  js/boot.js           încarcă datele, desenează strip-ul sau peretele, ascultă editorul
app/                   aplicația de admin (React, componente shadcn/ui, Tailwind)
data/db.json           creat la prima pornire, nu intră în git
uploads/               pozele optimizate, lângă server, nu intră în git
```

## Modelul de date

Formularele urmează schemele din `schema/`. Serverul validează fiecare salvare după aceleași fișiere.

- **#arch**: categorie, nume, poze (cu `spaced`), card (mărime și poză), apariția în lista de nume, date proiect, texte (fiecare cu `afterPhoto`), materiale (notă, poziție, maxim 4 materiale cu textură).
- **#concepts**: nume, client, tip, locație, an, 5 poze, 3 cifre, descriere, poveste, abordare, scope, poziția pe perete (A1–C5) și panoul final.

Poziția textelor și a materialelor (`afterPhoto`) e opțională. Dacă o lași goală, pagina le așază la fel ca site-ul de acum: textele după pozele 3, 6 și 9, materialele după poza 4.

## Site-ul live: API public

```
GET  /api/public/arch            proiectele publicate, în ordine
GET  /api/public/concepts
POST /api/public/unlock          { password } → { token }
GET  /api/public/arch            cu header X-Unlock: <token>, include conținutul proiectelor protejate
```

Fără token, un proiect protejat vine doar cu datele de card și de perete (`locked: true`). `/uploads/*` și `/api/public/*` au CORS deschis.

## Păstrarea preview-ului identic cu site-ul

`preview/js/project-page.js`, `preview/css/project-page.css`, `preview/js/concepts-page.js` și `preview/css/concepts-page.css` sunt copii ale codului din `zx-final`. Schimbările față de original sunt marcate cu `ADAPTED`. Când se modifică pagina de proiect pe site, copiază din nou fișierele și reaplică blocurile `ADAPTED`. La integrarea în site, varianta adaptată poate înlocui originalul, pentru că citește aceleași date din `/api/public/*`.
