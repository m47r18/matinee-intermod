# Audit API & datasets — Hack the Vibe Mobilités

Date d'audit : 2026-09-10. Tests réalisés sans clé API (navigateur, `fetch` depuis une origine tierce pour vérifier le CORS). Aucun secret enregistré.

Légende : **FAIT** = vérifié sur la source · **HYP** = hypothèse à confirmer · **MANQUE** = donnée absente.

---

## 0. Synthèse en 10 lignes

1. **FAIT** — SNCF Open Data (`ressources.data.sncf.com`) : 166 jeux, tous en ODbL, API Explore v2.1 **sans clé**, **CORS ouvert** (testé depuis `transport.data.gouv.fr`). Utilisable directement depuis un HTML single-file.
2. **FAIT** — Jointure gare possible entre jeux via l'UUID `id` de `gares-de-voyageurs` (= `gareid` élévatique = `id_gare` assistance) et le code UIC (= `uic` équipements accessibilité). Nantes : `77474ee2-…`, UIC `87481002`, trigramme `NTS`.
3. **FAIT** — État élévatique : MAJ horaire côté source, valeurs OK / KO / INCONNU / null. Nantes : 22 équipements, 2 KO le 10/09 à 14h30. Position GPS **supprimée d'ici fin été 2026** (bascule vers NeTEx) — champ non fiable pour le 25/09.
4. **FAIT** — Assistance Voyageur Handicapé : horaires, lieu de RDV, gratuité, prise en charge réservée/spontanée — par gare, MAJ quotidienne. Affichable sans fausse promesse (information, pas déclenchement).
5. **FAIT** — API SNCF (Navitia) : clé gratuite sur formulaire, 5 000 req/jour, **trains uniquement** (pas bus/car/vélo), fenêtre -1/+23 jours. Auth Basic ou clé dans l'URL. Endpoint répond en cross-origin (401 sans clé) → CORS **probablement** OK avec clé (HYP à confirmer dès réception).
6. **MANQUE** — Emport vélo à bord : **aucune donnée publique**. Navitia n'a pas de paramètre « vélo dans le train » (seulement rabattement `first/last_section_mode[]=bike|bss`, `park_mode`). Le GTFS SNCF a `bike_info_count = 0` (pas de `bikes_allowed`). Point dur confirmé pour le Sujet B.
7. **FAIT** — Stationnement vélo sécurisé en gare : statique (dernière valeur au 31/12/2024), nombre de places seulement, pas de disponibilité. Nantes : 883 places (objectif LOM 640).
8. **FAIT** — Naolib (Nantes Métropole) : GTFS + GTFS-RT (trip updates, alerts) + SIRI, licence LOv2, via `transport.data.gouv.fr`. VLS Naolib (Bicloo) en **GBFS temps réel**, CORS ouvert (testé `api.cyclocity.fr`).
9. **FAIT** — Aléop / Destineo : GTFS agrégé Pays de la Loire (ODbL) + GTFS Aléop interurbain (LOv2, `bike_info_count = 5054` → `bikes_allowed` renseigné sur les cars) + GTFS-RT + SIRI. Pas d'API calculateur publique identifiée (HYP).
10. **FAIT** — Temps réel SNCF sans clé : GTFS-RT trip updates + service alerts et SIRI Lite SX via `proxy.transport.data.gouv.fr`, CORS ouvert. Protobuf à décoder côté client (lib `gtfs-realtime-bindings`) ou SIRI XML.

---

## 1. Réponses aux questions du §7 de CONTEXT.md

### Priorité 1 — Sujet B (train + vélo)

| # | Question | Réponse | Statut |
|---|---|---|---|
| 1 | Navitia donne-t-il des trajets O/D pertinents ? | Oui, `GET /v1/coverage/sncf/journeys?from=…&to=…&datetime=…`. Trains SNCF uniquement (TGV, IC, TER, Lyria, Eurostar ; Transilien théorique). | FAIT |
| 2 | Filtrer / annoter un trajet avec la contrainte vélo ? | Non pour l'emport à bord. Oui pour le rabattement vélo/VLS avant-après (`first_section_mode[]`, `last_section_mode[]`, `bike_speed`, `park_mode`). Sur la couverture `sncf` le rabattement vélo n'est utile qu'entre gare et adresse. | FAIT |
| 3 | Donnée publique sur réservation / capacité / règle d'emport vélo ? | Aucune trouvée. Ni dans les 166 jeux SNCF Open Data, ni dans le GTFS SNCF (`bike_info_count=0`), ni dans Navitia. Règles d'emport = pages éditoriales SNCF Voyageurs/TER, non structurées. | MANQUE |
| 4 | Datasets gares / coordonnées / horaires / perturbations / vélo / accessibilité ? | Voir fiches §2. Gares : `gares-de-voyageurs` (2 782, quotidien). Horaires : GTFS SNCF (151 j glissants). Perturbations : GTFS-RT SA + SIRI SX. Vélo : stationnement sécurisé (statique). Accessibilité : 5 jeux (cf. §2). | FAIT |
| 5 | Naolib / Aléop : GTFS, GTFS-RT, API ? | Oui les trois (GTFS, GTFS-RT, SIRI) via transport.data.gouv.fr. Pas d'API « journeys » publique : soit intégrer un GTFS (lourd en 3 h), soit afficher les prochains passages depuis GTFS-RT, soit se limiter au VLS GBFS (léger, temps réel). | FAIT / HYP |
| 6 | Endpoints utilisables depuis un navigateur ? | SNCF Open Data : oui. GBFS Cyclocity : oui. Proxy transport.data.gouv.fr : oui. API SNCF Navitia : réponse 401 cross-origin reçue → en-têtes CORS présents ; à valider avec clé. Sinon proxy Node de 20 lignes. | FAIT / HYP |
| 7 | Démo sans temps réel ? | Oui : `data/samples/nantes-gare-sample.json` (extrait 10/09) + un GTFS-RT/Navitia enregistré en JSON la veille. | FAIT |

### Priorité 2 — Sujet A (assistance)

| # | Question | Réponse | Statut |
|---|---|---|---|
| 1 | Équipements avec état de fonctionnement exploitable ? | Ascenseurs + escaliers mécaniques (`etat-fonctionnement-elevatique-gare`, 2 668 équipements, MAJ horaire). Répartition nationale le 10/09 : 2 280 OK, 155 KO, 97 INCONNU, 136 null. | FAIT |
| 2 | Recherche par gare ? | Oui via `gareid` (UUID de `gares-de-voyageurs`). Pas de recherche par nom dans ce jeu : passer par `gares-de-voyageurs?where=nom like "…"` d'abord. | FAIT |
| 3 | Dispositifs de contact / assistance affichables sans fausse promesse ? | Jeu `assistance-psh-pmr` : lieu de RDV, horaires, gratuité, réservé/spontané. Le canal de contact réel (Assist'enGare, 3635) n'est **pas** dans les jeux : à référencer depuis la page officielle SNCF si on l'affiche. | FAIT / HYP |
| 4 | Données affichables sans donnée personnelle ? | Tout ce qui précède est descriptif gare/équipement. Aucune donnée voyageur. | FAIT |
| 5 | Alerte fictive structurée sans imiter un système réel ? | Oui : écran « Simulation — poste opérateur fictif », JSON structuré (gare, localisation, type de besoin choisi, équipement KO concerné). Aucun envoi réel. | FAIT (choix de conception) |

---

## 2. Fiches sources

### 2.1 SNCF Open Data — plateforme

```yaml
nom: "SNCF Open Data (Opendatasoft) — API Explore v2.1"
url: "https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/{dataset_id}/records"
organisme: "SNCF (Gares & Connexions, Réseau, Voyageurs)"
date_consultation: "2026-09-10"
licence: "ODbL — https://data.sncf.com/pages/licence"
format: "JSON (records, exports CSV/JSON/GeoJSON)"
authentification: "aucune"
cors: "oui (testé depuis transport.data.gouv.fr, HTTP 200)"
fraicheur: "par jeu, champ metas.default.modified"
champs_utiles: ["where= (ODSQL)", "select=", "group_by=", "limit= (max 100 par page)", "order_by="]
limites: ["100 enregistrements/page", "recherche catalogue : where=\"mot\" fonctionne, search= non", "quota non documenté publiquement — rester frugal"]
scenario_hackathon: "Source principale des deux sujets, appelable en direct depuis le front."
statut: "valide"
```

### 2.2 Gares de voyageurs (référentiel)

```yaml
nom: "Gares de voyageurs"
url: "https://ressources.data.sncf.com/explore/dataset/gares-de-voyageurs/"
organisme: "SNCF Gares & Connexions"
date_consultation: "2026-09-10"
licence: "ODbL"
format: "JSON / CSV / GeoJSON"
authentification: "aucune"
cors: "oui"
fraicheur: "2026-09-10 (quotidien)"
champs_utiles: ["id (UUID — clé de jointure élévatique/assistance)", "nom", "libellecourt (trigramme)", "codes_uic", "position_geographique {lon,lat}", "segment_drg", "codeinsee"]
limites: ["2 782 gares", "nom exact : Nantes = \"Nantes\""]
scenario_hackathon: "Autocomplétion gare + pivot pour toutes les jointures."
statut: "valide"
```

### 2.3 État de fonctionnement élévatique

```yaml
nom: "Etat de fonctionnement des équipements d'élévatique en gare"
url: "https://ressources.data.sncf.com/explore/dataset/etat-fonctionnement-elevatique-gare/"
organisme: "SNCF Gares & Connexions"
date_consultation: "2026-09-10"
licence: "ODbL"
format: "JSON / CSV"
authentification: "aucune"
cors: "oui"
fraicheur: "MAJ horaire (dernière : 2026-09-10 13:30 UTC)"
champs_utiles: ["gareid (UUID)", "id", "libelle (ex. 'ascenseur - Quai B')", "localisationdescriptive", "etat_de_fonctionnement (OK|KO|INCONNU|null)", "position_geographique (texte 'lat, lon')"]
limites: ["position_geographique annoncée supprimée d'ici fin été 2026 → ne pas en dépendre", "état 'non contractuel'", "pas de nom de gare dans le jeu : jointure obligatoire", "136 équipements sans état"]
scenario_hackathon: "Sujet A : afficher les ascenseurs/escaliers KO de la gare et proposer un cheminement alternatif. Nantes : 22 équipements."
statut: "valide"
```

### 2.4 Assistance Voyageur Handicapé (PSH/PMR)

```yaml
nom: "Données du service d'Assistance Voyageur Handicapé en gare"
url: "https://ressources.data.sncf.com/explore/dataset/assistance-psh-pmr/"
organisme: "SNCF Gares & Connexions"
date_consultation: "2026-09-10"
licence: "ODbL"
format: "JSON / CSV"
authentification: "aucune"
cors: "oui"
fraicheur: "2026-09-10 (quotidien)"
champs_utiles: ["id_gare (UUID)", "nom", "code_uic", "typepriseencharge (RESERVE / RESERVE ET SPONTANE)", "typetarification", "lieurendezvousgare", "premierauderniertrain", "horaires_jour_nominal_*"]
limites: ["1 081 gares couvertes", "pas de canal de contact (téléphone/URL)", "format horaires texte '04:20 - 00:15'"]
scenario_hackathon: "Sujet A : dire au voyageur où aller et à quelles heures l'assistance existe, sans prétendre la déclencher."
statut: "valide"
```

### 2.5 Équipements d'accessibilité en gare

```yaml
nom: "Equipements d'accessibilité en gare"
url: "https://ressources.data.sncf.com/explore/dataset/equipements-accessibilite-en-gare/"
organisme: "SNCF Gares & Connexions"
date_consultation: "2026-09-10"
licence: "ODbL"
format: "JSON / CSV"
authentification: "aucune"
cors: "oui"
fraicheur: "2026-08-12"
champs_utiles: ["uic", "nom_de_la_gare", "adresse", "accessibilite (une ligne par équipement)"]
limites: ["1 717 lignes, format 'long' (1 ligne = 1 équipement)", "libellés libres"]
scenario_hackathon: "Sujet A : liste des services (boucle magnétique, fauteuil à disposition, toilettes adaptées…). Nantes : 9 items."
statut: "valide"
```

### 2.6 Autres jeux accessibilité

- `accessibilite_gares` — **NeTEx Accessibilité** (XML, hebdo). Contient accessibilité globale + ascenseurs/escaliers avec position. Plus riche mais XML lourd : réserver à un parsing offline si besoin de la géoloc. Statut : **à tester si besoin**.
- `equipements-accessibilite-sncf` — 30 lignes, référentiel de vocabulaire (colonnes `column_1`, `column_2` non nommées). Statut : **abandonné** (peu utile).
- `accompagnement-pmr-gares` — volumes mensuels d'accompagnements par gare, arrêté 2022-03. Statut : **abandonné** pour le proto (contexte chiffré seulement).

### 2.7 Stationnement vélo sécurisé en gare

```yaml
nom: "Stationnement vélo sécurisé en gare"
url: "https://ressources.data.sncf.com/explore/dataset/stationnement-securise-velo-en-gare-au-30-06-24/"
organisme: "SNCF Gares & Connexions"
date_consultation: "2026-09-10"
licence: "ODbL"
format: "JSON / CSV"
authentification: "aucune"
cors: "oui"
fraicheur: "données au 31/12/2024, publiées 2025-04-01, irrégulier"
champs_utiles: ["code_gare (trigramme)", "nom_de_la_gare", "region (ex. PDL)", "gare_lom_hors_lom", "objectif_decret_lom", "nombre_places_au_06_24", "nombre_places_au_12_24"]
limites: ["capacité, pas de disponibilité", "pas de géoloc ni de type d'abri", "nom de gare peut différer du référentiel → joindre par trigramme"]
scenario_hackathon: "Sujet B : « 883 places sécurisées à Nantes » comme information contextuelle, clairement datée."
statut: "valide"
```

### 2.8 API SNCF (Navitia)

```yaml
nom: "API SNCF — information voyageurs (Navitia)"
url: "https://api.sncf.com/v1/coverage/sncf/"
organisme: "SNCF / Hove"
date_consultation: "2026-09-10"
licence: "CGU Navitia — https://navitia.io/conditions-generales-dutilisation/ (à lire avant démo publique)"
format: "JSON"
authentification: "clé API gratuite (formulaire numerique.sncf.com), Basic auth (user = clé, mdp vide) ou clé dans l'URL"
cors: "non testé avec clé — 401 reçu en cross-origin, donc en-têtes CORS présents (HYP : OK)"
fraicheur: "théorique + temps réel TGV/IC/TER/Lyria/Eurostar ; Transilien théorique ; fenêtre -1/+23 jours"
champs_utiles: ["/journeys (from, to, datetime, data_freshness=realtime, first_section_mode[], last_section_mode[], forbidden_uris[])", "/places?q= (autocomplétion)", "/stop_areas/{id}/departures", "/disruptions", "sections[].display_informations", "journeys[].status"]
limites: ["5 000 req/jour, blocage si dépassé", "trains uniquement, pas de bus/car/VLS", "aucune notion d'emport vélo à bord", "ids non garantis stables", "wheelchair=true : données 'trop faibles' selon la doc"]
scenario_hackathon: "Sujet B : alternatives de trains (stratégie 1). Sujet A : prochains départs / perturbations de la gare. Plan B : réponses enregistrées en JSON."
statut: "à tester dès réception de la clé"
```

Doc : https://doc.navitia.io/ · Playground : https://playground.navitia.io/ · FAQ : https://numerique.sncf.com/faq/api/

### 2.9 Horaires et temps réel SNCF sans clé

```yaml
nom: "Réseau SNCF TGV, Intercités et TER — GTFS / GTFS-RT / SIRI Lite"
url: "https://transport.data.gouv.fr/datasets/horaires-sncf"
organisme: "SNCF Voyageurs via transport.data.gouv.fr"
date_consultation: "2026-09-10"
licence: "ODbL"
format: "GTFS (zip, 8 715 arrêts, validité 2026-09-09 → 2027-02-28) ; GTFS-RT protobuf (trip-updates, service-alerts) ; SIRI Lite XML (SX, ET)"
authentification: "aucune"
cors: "oui sur proxy.transport.data.gouv.fr (testé : SA protobuf 1 Mo, SIRI SX XML)"
fraicheur: "GTFS quotidien ; RT toutes les 2 min"
champs_utiles: ["GTFS-RT service-alerts : perturbations", "SIRI SX : mêmes incidents en XML lisible", "GTFS trips.txt : pas de bikes_allowed (bike_info_count=0)"]
limites: ["GTFS complet trop lourd pour un front en 3 h", "protobuf à décoder (gtfs-realtime-bindings)", "1 Mo par appel alerts"]
scenario_hackathon: "Afficher les perturbations en cours autour de Nantes sans clé, ou déclencher le scénario 'train supprimé' sur un incident réel."
statut: "valide (à échantillonner la veille)"
```

### 2.10 Naolib — Nantes Métropole

```yaml
nom: "Réseau urbain Naolib (tram, bus, navibus)"
url: "https://transport.data.gouv.fr/datasets/reseau-de-transports-collectifs-naolib"
organisme: "Nantes Métropole / SEMITAN — miroir de data.nantesmetropole.fr"
date_consultation: "2026-09-10"
licence: "Licence Ouverte v2 (LOv2)"
format: "GTFS (3 633 arrêts, 2026-09-08 → 2026-12-08), NeTEx, GTFS-RT (trip-update, alerts), SIRI / SIRI Lite"
authentification: "aucune (le flux SIRI Okina embarque une clé publique 'transportdatagouv' dans l'URL)"
cors: "non testé"
fraicheur: "GTFS 2026-09-02 ; RT continu"
champs_utiles: ["arrêts autour de la gare (Gare Nord / Gare Sud, tram 1, C3…)", "prochains passages via trip-update"]
limites: ["pas d'API itinéraire publique", "bike_info_count=0"]
scenario_hackathon: "Sujet B stratégie 3 : afficher les arrêts tram/bus à la gare et leurs prochains passages. Sinon lien sortant vers naolib.fr."
statut: "à tester"
```

```yaml
nom: "VLS Naolib (Bicloo) — GBFS"
url: "https://api.cyclocity.fr/contracts/nantes/gbfs/gbfs.json"
organisme: "Nantes Métropole / JCDecaux Cyclocity"
date_consultation: "2026-09-10"
licence: "LOv2"
format: "GBFS 2.3 (station_information, station_status) et v3"
authentification: "aucune"
cors: "oui (testé, HTTP 200)"
fraicheur: "temps réel, ttl 3600 s sur le fichier racine"
champs_utiles: ["station_information : name, lat, lon, capacity", "station_status : num_bikes_available, num_docks_available"]
limites: ["stations autour de la gare à filtrer par distance"]
scenario_hackathon: "Sujet B stratégie 2 : « vélos disponibles à la gare d'arrivée » — vraie donnée temps réel, très démonstrative."
statut: "valide"
```

Également disponibles (non prioritaires) : Naolib micromob GBFS (vélos/trottinettes, ecovelo), autopartage Citiz GBFS, lieux de covoiturage.

### 2.11 Aléop / Destineo — Région Pays de la Loire

```yaml
nom: "Agrégat des réseaux urbains et interurbains des Pays de la Loire (Destineo)"
url: "https://transport.data.gouv.fr/datasets/arrets-horaires-et-circuits-des-lignes-de-transports-en-commun-en-pays-de-la-loire-gtfs-destineo-reseaux-aom-aleop-1"
organisme: "Région des Pays de la Loire"
date_consultation: "2026-09-10"
licence: "ODbL"
format: "GTFS agrégé, NeTEx, SIRI temps réel (documentation PDF fournie)"
authentification: "aucune (SIRI : à vérifier dans la doc)"
cors: "non testé"
fraicheur: "2026-09-08"
champs_utiles: ["tout le TC régional en un seul GTFS"]
limites: ["volumineux", "pas d'API calculateur publique identifiée : Destineo est un site (HYP)"]
scenario_hackathon: "Pas en direct. Éventuellement extraction offline des arrêts autour de la gare."
statut: "à tester si besoin"
```

```yaml
nom: "Réseau interurbain Aléop"
url: "https://transport.data.gouv.fr/datasets/arrets-horaires-et-circuits-des-lignes-de-transports-aleop-1"
organisme: "Région des Pays de la Loire"
date_consultation: "2026-09-10"
licence: "LOv2"
format: "GTFS (9 784 arrêts, 2026-08-09 → 2027-08-31), GTFS-RT (trip-update, vehicle-position, alerts)"
authentification: "aucune"
cors: "non testé"
fraicheur: "quotidien"
champs_utiles: ["bikes_allowed renseigné (bike_info_count=5054) — seul jeu de la région avec une info vélo à bord"]
limites: ["cars, pas trains"]
scenario_hackathon: "Sujet B : « car Aléop acceptant les vélos » comme alternative — la seule donnée vélo-à-bord réelle disponible."
statut: "à tester"
```

### 2.12 Sources techniques (non testées, connues)

- **BAN** `https://api-adresse.data.gouv.fr/search/?q=` — géocodage, LO, sans clé, CORS OK. Statut : valide (usage courant).
- **Overpass (OSM)** — loueurs vélo (`shop=bicycle`), parkings vélo (`amenity=bicycle_parking`) autour de la gare, ODbL, sans clé, CORS OK, quotas partagés. Statut : à tester.
- **Valhalla** — routage vélo ; instance publique de démo `valhalla.openstreetmap.de` (usage démo uniquement, pas de garantie). Statut : optionnel.

---

## 3. Ce que ça change pour le choix du sujet

| | Sujet A — assistance | Sujet B — train + vélo |
|---|---|---|
| Donnée réelle au cœur du problème | **Oui** : état ascenseurs (horaire), assistance par gare, équipements | **Non** : emport vélo à bord inexistant en open data. Le cœur reste simulé. |
| Données réelles périphériques | Départs/perturbations (Navitia ou GTFS-RT) | Trains alternatifs (Navitia), VLS temps réel (GBFS), stationnement (statique), cars Aléop `bikes_allowed` |
| Dépendance à une clé | Aucune pour le MVP | Navitia nécessaire pour la stratégie 1 |
| Ce qui doit être simulé | L'alerte opérateur (assumée) | Le déclencheur « plus de place vélo » (assumé) |

Lecture : le Sujet A tient debout sur 100 % de données réelles sans clé ; le Sujet B est plus visuel mais sa promesse centrale repose sur une hypothèse. Recommandation détaillée à produire après décision officielle (semaine du 14/09) — cf. TODO.

---

## 4. Points à confirmer avant le 25/09

- [ ] Réception d'une clé API SNCF et test CORS réel (`fetch` depuis le front). Sinon : proxy Node 20 lignes dans un proxy (Edge Function Supabase ou Node).
- [ ] Lire les CGU Navitia avant toute démo publique (mention de source obligatoire ?).
- [ ] Échantillonner la veille : réponse `/journeys` Nantes→Rennes, GTFS-RT service alerts, `station_status` Bicloo.
- [ ] Vérifier si `position_geographique` élévatique est encore présente le 24/09 ; sinon plan : `localisationdescriptive` en texte seulement.
- [ ] Page officielle SNCF du canal d'assistance à citer (Assist'enGare) — ne pas inventer de numéro.
