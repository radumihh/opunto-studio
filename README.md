# Opunto Studio

Adminul pentru proiectele de pe site-urile Opunto, **#arch** și **#concepts**. Aici adaugi, editezi, reordonezi și ștergi proiecte. Pozele se optimizează automat. Preview-ul rulează **aceeași pagină de proiect ca y-final**, nu o imitație. Site-ul își ia proiectele de aici prin API-ul public (vezi [integration/](integration/README.md)).

## Aplicația Windows

```bash
npm install
npm run dist:win
```

Rezultatul e `release/Opunto-Studio-Setup-<versiune>.exe`, un installer care conține tot ce trebuie: serverul, interfața, preview-ul, proiectele (`data/db.json`) și pozele (`poze/`). Clientul îl rulează, iar aplicația se instalează fără drepturi de administrator și pornește singură, cu scurtătură pe Desktop.

- **Datele clientului** stau în `Documente\Opunto Studio`: `data\db.json` pentru proiecte, `data\settings.json` pentru parole și `poze\architecture|concepts\<proiect>\1.avif …` pentru poze. La prima pornire folderul se umple cu proiectele și pozele cu care a fost construită aplicația. De atunci e al clientului: o versiune nouă a aplicației și dezinstalarea nu îl ating.
- **Rulare fără installer, pentru test:** `npm run app`.
- **În fereastră:** F5 reîncarcă pagina, F12 deschide uneltele de dezvoltator.
- **Installer nesemnat:** Windows SmartScreen arată la prima rulare „Windows protected your PC”. Clientul apasă „More info”, apoi „Run anyway”.

## Când clientul a terminat portofoliul

În aplicație: **Setări → Exportă portofoliul → Exportă .zip**. Fișierul se salvează implicit pe Desktop, iar la final se deschide folderul cu el selectat. Clientul ți-l trimite prin WeTransfer, Google Drive sau un link OneDrive, pentru că are ~90 MB și nu încape pe email.

Zip-ul are structura repo-ului:

```
data/db.json      toate proiectele, textele, categoriile (fără parole)
poze/architecture/<proiect>/1.avif … n.avif   (+ .sm.webp)
poze/concepts/<proiect>/1.avif …
CITESTE.txt       câte proiecte și poze conține
```

Ca să-l folosești, îl dezarhivezi peste folderul `opunto-studio` (înlocuiește `data/db.json` și `poze/`) și pornești `npm run dev`. Pentru y-final, datele sunt aceleași ca în `/api/public/arch` și `/api/public/concepts`.

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

Scriptul face tot: actualizează sistemul, instalează Node 22, nginx, certbot și firewall-ul (SSH, HTTP, HTTPS), creează utilizatorul `opunto`, clonează repo-ul în `/opt/opunto-studio`, face build-ul, pornește serviciul systemd și ia un certificat HTTPS gratuit. Proiectele (`data/db.json`) și pozele (`poze/`) sunt în repo, deci vin odată cu `git clone`.

La final îți afișează adresa: `https://<IP-ul VM-ului>`. Certificatul e de la Let's Encrypt, pentru IP, fără domeniu. E valabil 6 zile și certbot îl reînnoiește singur. Dacă nu se poate obține (ex. portul 443 închis), Studio merge pe `http://<IP>`, iar scriptul îți spune asta.

**Cu un domeniu:** un record DNS de tip A, ex. `studio` → IP-ul VM-ului la `opunto.ro`, apoi `sudo -i` și `DOMAIN=studio.opunto.ro bash install.sh` (la prima instalare, și `ADMIN_PASSWORD='…'`). Merge și ca update: certificatul se ia singur și se reînnoiește singur, iar IP-ul duce de atunci la `https://studio.opunto.ro`. Adresele gratuite `*.sslip.io` nu le folosim: operatorii din România le blochează.

Pe Google Cloud, la VM trebuie bifate **Allow HTTP traffic** și **Allow HTTPS traffic**, iar IP-ul extern trebuie făcut static (VPC network → IP addresses → Promote to static).

### Ce au lucrat clienții în aplicația Windows → pe server

1. Fiecare: **Setări → Exportă portofoliul → Exportă .zip** și ți-l trimite. Din acel moment lucrează doar pe server.
2. Urci zip-urile pe VM (Google Cloud: în fereastra SSH, ⚙ → **Upload file**; ajung în folderul tău de acasă).
3. Pe VM: `sudo bash /opt/opunto-studio/deploy/import.sh ~/*.zip`. Îți arată proiectele noi, modificate, șterse și ce au modificat amândoi (se păstrează versiunea salvată ultima), apoi te întreabă. La `da` oprește Studio, face o copie în `/var/backups`, unește, repornește.
4. Pozele se copiază exact cum sunt în zip, fără a doua comprimare.

Importul se face **înainte** ca cineva să lucreze pe server: proiectele de pe server sunt punctul de plecare comun, iar un proiect făcut pe server și absent din zip-uri ar fi socotit șters. Local merge la fel: `npm run import -- a.zip b.zip --dry`.

**Update:** `sudo bash /opt/opunto-studio/deploy/install.sh`. Aduce codul nou și repornește serviciul. Proiectele, pozele și parolele de pe VM rămân cele de pe VM.


**Backup:** copiază `data/` și `poze/`. Parolele stau separat, în `data/settings.json`, care nu intră în repo. Din Setări → Backup poți descărca și un JSON cu toate proiectele. La fiecare scriere, versiunea anterioară a bazei rămâne în `data/db.json.bak`.

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
