# Opunto Studio

Adminul pentru proiectele de pe site-urile Opunto, **#arch** și **#concepts**. Aici adaugi, editezi, reordonezi și ștergi proiecte. Pozele se optimizează automat. Preview-ul rulează **aceeași pagină de proiect ca y-final**, nu o imitație. Site-ul își ia proiectele de aici prin API-ul public (vezi [integration/](integration/README.md)).

## Pornire locală

```bash
npm install
npm run dev
```

Aplicația: http://localhost:5173. API-ul rulează pe :4100.

## Pe un VM (Ubuntu) — un singur script

Pe un Ubuntu 22.04/24.04 curat, ca root:

```bash
curl -fsSL https://raw.githubusercontent.com/radumihh/opunto-studio/main/deploy/install.sh -o install.sh
sudo ADMIN_PASSWORD='parola-lunga' bash install.sh
```

Scriptul face tot: actualizează sistemul, instalează Node 22, nginx și firewall-ul (SSH, HTTP), creează utilizatorul `opunto`, clonează repo-ul în `/opt/opunto-studio`, face build-ul și pornește serviciul systemd. La prima instalare aduce și proiectele cu pozele lor din `seed/`. La final îți afișează adresa: `http://<IP-ul VM-ului>`.

**Update:** `sudo bash /opt/opunto-studio/deploy/install.sh`. Aduce codul nou și repornește serviciul. Proiectele, pozele și parolele de pe server rămân neatinse.

**Proiectele din seed:** `npm run snapshot` copiază proiectele și pozele de acum în `seed/`, fără parole. Commit-ul lor intră la următoarea instalare nouă.

**Backup:** copiază `data/` și `poze/`. Din Setări → Backup poți descărca și un JSON cu toate proiectele. La fiecare scriere, versiunea anterioară a bazei rămâne în `data/db.json.bak`.

Dacă `HOST` nu e `127.0.0.1` și nu există o parolă de admin, serverul refuză să pornească.

## Ce face

| | |
|---|---|
| **Proiecte** | Creezi, editezi, duplici și ștergi proiecte. Trage cardurile ca să schimbi ordinea din site. Numărul de pe card e cel de pe site. |
| **Poze** | Le tragi în pagină sau le alegi din calculator (JPG, PNG, WebP, AVIF, TIFF; max 60 MB/poză). Vezi progresul la fiecare poză și le reordonezi prin drag. Din meniul fiecărei poze alegi coperta, poza de pe card, un spațiu mai mare înainte și textul alt. HEIC-ul de pe iPhone e refuzat cu un mesaj care explică cum îl exporți ca JPG. |
| **Poze pe disc** | Totul stă în `poze/`, lângă server: `poze/architecture/<nume-proiect>/1.avif … n.avif` și `poze/concepts/<nume-proiect>/1.avif …`, numerotate în ordinea din pagină. Texturile materialelor sunt `material-1.avif …`, în folderul proiectului. La reordonare, redenumire sau ștergere, fișierele se renumerotează, se mută sau se șterg singure. Pozele urcate și încă nesalvate așteaptă în `poze/_incoming/`. |
| **Optimizare** | Fiecare poză devine AVIF: maxim 2560px, calitate 60, cu ~⅓ mai mic decât un WebP de aceeași calitate. Lângă ea stă `<n>.sm.webp` de 720px, pentru miniaturi. Originalul nu se păstrează. |
| **Materiale (#arch)** | Până la 4 materiale. Textura o tragi peste pătrat, o alegi din calculator sau o iei dintre cele 4 texturi pe care le folosește y-final acum (Granite, Marble, Black oak veneer, Brushed concrete). Totul e opțional: fără materiale, blocul nu apare. |
| **Preview live** | În dreapta editorului rulează pagina reală a site-ului, la mărimea reală (1440, 1280 sau 390 px). Fiecare modificare apare în ~0.3s, fără reîncărcare, în locul în care ai rămas cu scroll-ul. Sub 1100px lățime, preview-ul se deschide în tab separat. |
| **Parole** | Parola de intrare în Studio (sesiune de 30 de zile, cu limită de încercări). Separat, o parolă comună pentru proiectele protejate; în fiecare proiect doar o activezi sau o dezactivezi. Modul „Vizitator” din preview arată ecranul de parolă exact cum îl vede publicul. |
| **Siguranță** | Plecarea din editor cu modificări nesalvate cere confirmare. Dacă proiectul a fost salvat între timp din alt tab, alegi ce versiune păstrezi. Publicarea cere conținutul minim, iar ce lipsește apare lângă fiecare câmp. |

## Teste

```bash
npm test
```

Pornește serverul real pe date temporare și verifică upload-ul, validarea, publicarea, conflictele, ștergerea pozelor, API-ul public, parolele, limitarea încercărilor și pornirea pe un VM fără parolă.

## Structură

```
server.js              API, poze, preview și aplicația compilată
lib/config.js          variabilele de mediu (.env)
lib/store.js           baza de date = data/db.json (scriere atomică, cu .bak)
lib/images.js          optimizarea pozelor (sharp), așezarea în poze/<site>/<proiect>/ și ștergerea celor nefolosite
lib/validate.js        validare după schema/*.json, mesaje în română
lib/lock.js            parole (scrypt), sesiuni, tokenuri, limitarea încercărilor
lib/defaults.js        categoriile #arch și texturile din y-final
schema/                modelele JSON (proiect #arch, proiect #concepts, poză, categorie)
preview/               paginile de proiect din y-final, alimentate din bază
integration/           legătura cu y-final (opunto-feed.js + instrucțiuni)
app/                   aplicația Studio (React, shadcn/ui, Tailwind)
test/                  testele serverului
deploy/                systemd + nginx
```

## API public (pentru site)

```
GET  /api/public/arch                 proiectele #arch publicate, în ordine
GET  /api/public/concepts             proiectele #concepts publicate
GET  /api/public/arch/categories      cele trei categorii
POST /api/public/unlock               { password } → { token }
     header X-Unlock: <token>         conținutul complet al proiectelor protejate
```

Fără token, un proiect protejat vine doar cu datele pentru card și perete (`locked: true`).
