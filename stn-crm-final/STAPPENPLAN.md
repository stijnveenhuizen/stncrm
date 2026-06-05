# STN CRM — Stappenplan om live te zetten

## Stap 1 — Supabase account aanmaken (5 min)

1. Ga naar **supabase.com** → "Start your project" → maak een gratis account
2. Klik "New project" → geef het een naam (bijv. `stn-crm`) → kies een wachtwoord → kies regio "West EU (Ireland)"
3. Wacht ~2 minuten tot het project klaar is

## Stap 2 — Database aanmaken

1. Ga in je Supabase project naar **SQL Editor** (linkerzijbalk)
2. Klik "New query"
3. Kopieer de volledige inhoud van `SUPABASE_SETUP.sql` en plak het in de editor
4. Klik "Run" — je ziet groen als alles goed gaat

## Stap 3 — Jouw account aanmaken in Supabase

1. Ga naar **Authentication** → **Users** → "Invite user"
2. Vul jouw e-mailadres in
3. Je ontvangt een mail — klik de link en stel een wachtwoord in
4. (Je kunt ook zelf een user aanmaken via "Add user" → "Create new user")

## Stap 4 — API keys kopiëren

1. Ga in Supabase naar **Project Settings** → **API**
2. Kopieer:
   - **Project URL** (bijv. `https://xyzxyz.supabase.co`)
   - **anon public key** (de lange string onder "Project API keys")

## Stap 5 — .env bestand aanmaken

Maak in de `stn-crm` map een bestand `.env` aan met:

```
VITE_SUPABASE_URL=https://jouwproject.supabase.co
VITE_SUPABASE_ANON_KEY=jouw-anon-public-key
```

(Vervang de waarden door wat je in stap 4 gekopieerd hebt)

## Stap 6 — Vercel account + deployen (5 min)

1. Ga naar **vercel.com** → maak een gratis account (log in met GitHub als je dat hebt, anders gewoon e-mail)
2. Klik "Add New Project" → "Upload" (of gebruik de Vercel CLI)

**Makkelijkste manier — via GitHub:**
- Zet de `stn-crm` map op GitHub (gratis account)
- Vercel koppelen aan GitHub repo → automatisch gebuild en live

**Of direct uploaden:**
1. Installeer Node.js als je dat nog niet hebt (nodejs.org)
2. Open terminal in de `stn-crm` map
3. Run: `npm install`
4. Run: `npm run build` → dit maakt een `dist` map aan
5. Ga naar vercel.com → "Add New Project" → drag-and-drop de `dist` map

## Stap 7 — Environment variables in Vercel

1. In Vercel bij je project → **Settings** → **Environment Variables**
2. Voeg toe:
   - `VITE_SUPABASE_URL` = jouw Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = jouw anon key
3. Klik "Save" → Vercel herdeployt automatisch

## Klaar!

Je CRM is nu live op een vercel.app URL (bijv. `stn-crm-xyz.vercel.app`).
Je kunt ook een eigen domein koppelen via Vercel → Settings → Domains.

## Op mobiel gebruiken

Ga gewoon naar de URL in Safari of Chrome op je telefoon.
Wil je het als app-icoon op je homescreen?
- **iPhone**: open in Safari → deel-icoon → "Zet op beginscherm"
- **Android**: open in Chrome → menu → "Toevoegen aan startscherm"
