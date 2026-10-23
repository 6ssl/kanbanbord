# Plak — kanbanbord

Een statische Nederlandstalige kanban-app met een interactieve mindmap en plaknotities. Er zijn geen buildstappen nodig. Voor multiplayer wordt de Supabase-browserclient vanaf jsDelivr geladen.

## Lokaal bekijken

Open `index.html` in een moderne browser. Zonder room worden taken, kolommen en notities lokaal in de browser opgeslagen (`localStorage`). Zodra je een Supabase-room joint, synchroniseren taken en notities tussen roomleden.

## Publiceren met GitHub Pages

1. Zet `index.html`, `styles.css`, `app.js`, `supabase-schema.sql` en dit bestand in de hoofdmap van de repository.
2. Open **Settings → Pages** op GitHub.
3. Kies **Deploy from a branch**, selecteer `main` en de map `/ (root)`, en sla op.
4. Open de URL die GitHub Pages toont.

## Realtime samenwerken instellen

GitHub Pages host alleen de statische website. De multiplayerfunctie gebruikt daarom een eigen Supabase-project.

1. Open in je Supabase-project **Authentication → Sign In / Providers → User Signups → Allow anonymous sign-ins** en schakel anonieme aanmelding in.
2. Open **SQL Editor** en voer de inhoud van [`supabase-schema.sql`](./supabase-schema.sql) uit. Dit maakt de rooms, beveiligde ledenregels en database-realtime-publicatie aan.
3. De Project URL en anon/publishable key van dit project zijn al ingesteld in de website.
4. Klik **Deel bord → Nieuwe room**. Je krijgt een willekeurige roomcode en een uitnodigingslink. Anderen openen die link of voeren de code in bij **Room joinen**.

De app gebruikt anonieme Supabase-authenticatie en Row Level Security: alleen een aangemeld lid van een room kan de opgeslagen bordgegevens lezen of wijzigen. De roomcode is een toegangssleutel; deel hem alleen met mensen die je vertrouwt. De publishable/anon key is bedoeld voor gebruik in een browser; zet nooit een `service_role`-sleutel in deze website.

Anonieme aanmelding was voor dit Supabase-project uitgeschakeld toen de verbinding werd getest. Schakel deze dus eerst in; anders kunnen gebruikers geen rooms maken of joinen. De Supabase-instellingenpagina gaf tijdens configuratie een dashboardfout.

`@supabase/server`, `SUPABASE_SECRET_KEY` en `SUPABASE_JWKS_URL` zijn bedoeld voor een serverbackend en worden niet gebruikt door deze statische GitHub Pages-app. Publiceer of deel nooit een secret/service-role key.

Taakwijzigingen en plaknotities synchroniseren live. Deelnemers zien elkaars naam, eigen kleur en cursor zolang ze in dezelfde room zitten. De mindmapkaartjes zijn op dit moment nog lokaal en synchroniseren niet.
