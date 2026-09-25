---
name: connecterauxapis
description: Créer une connexion aux APIs pour récupérer des informations sur les transports, les hôtels, les consignes, les réparateurs de vélos et les solutions de mobilité.
---
Tout ce qu'il faut pour brancher un prototype sur des données réelles le 25/09, sans perdre la matinée à chercher où sont les endpoints. Ce document ne décrit aucune application : il décrit des sources. Ce que vous en faites vous appartient.


# Liste des APIs vers lesquelles se connecter

| | |
|---|---|
| Base | `https://api.navitia.io/v1/coverage/sncf` |
| Auth | HTTP Basic, token en login, mot de passe vide : `Authorization: Basic base64(token + ":")` |
| Clé | gratuite, formulaire sur `numerique.sncf.com/startup/api/token-developpeur` |
| Quota | 5 000 requêtes/jour · fenêtre horaire J-1 à J+23 |
| CORS | OK, testé en fetch navigateur le 14/09/2026 |
| Licence | voir les CGU du jeton ; mention de la source à vérifier avant démo publique |

Couverture accessible avec le jeton : `sncf`, soit les trains SNCF (TGV INOUI, OUIGO, Intercités, TER, Transilien en théorique). Pas de bus urbain, pas de car interurbain, pas de vélo.

## Chercher une gare

```
GET /coverage/sncf/places?q=Nantes&type[]=stop_area&count=8
```

Réponse : `places[]` avec `id`, `name`, `quality`, `embedded_type`, et un sous-objet `stop_area` contenant `coord` (attention, `lat` et `lon` sont des **chaînes**), `label`, `codes` (dont l'UIC), `commercial_modes`, `physical_modes`, `lines`.

Le point important : `id` a la forme `stop_area:SNCF:87481002` et se réutilise tel quel dans le calcul d'itinéraire. Les huit chiffres finaux sont le **code UIC**, qui sert de clé de jointure avec les jeux SNCF Open Data. Sans passer par `places`, on peut donc fabriquer un identifiant à la main : `stop_area:SNCF:` + UIC.

UIC utiles sur les trois territoires : Nantes `87481002`, Rennes `87471003`, Angers Saint-Laud `87484006`, Le Mans `87396002`, Saint-Nazaire `87481200`, Tours `87571000`, Orléans `87543009`, Quimper `87474858`, Brest `87474007`, La Roche-sur-Yon `87481838`. À confirmer d'un appel `places` — ce sont des repères, pas un référentiel.

## Calculer un itinéraire

```
GET /coverage/sncf/journeys
    ?from=stop_area:SNCF:87481002
    &to=stop_area:SNCF:87471003
    &datetime=20260925T173000
    &datetime_represents=departure
    &count=6
    &data_freshness=realtime
```

`datetime` est au format `AAAAMMJJTHHMMSS`, sans séparateur, sans fuseau.

Réponse : `journeys[]` avec `duration` (secondes), `nb_transfers`, `departure_date_time`, `arrival_date_time`, `status`, `tags` (`asap`, `ecologic`, `reliable`, `walking`), et `sections[]`. Une section a un `type` (`public_transport`, `transfer`, `waiting`, `crow_fly`), et pour les sections de train un `display_informations` (mode commercial, code de ligne, direction, réseau, `trip_short_name`) plus `stop_date_times[]` qui donne pour chaque arrêt l'horaire théorique **et** l'horaire réel — l'écart entre les deux, c'est le retard. Le tableau racine `disruptions[]` porte les perturbations, reliées aux sections par `display_informations.links`.

Deux paramètres prêtent à confusion. `first_section_mode[]=bike|bss|walking` et `last_section_mode[]=bike|bss|walking` gèrent le vélo **pour rejoindre ou quitter la gare**, pas le vélo embarqué dans le train. Sur la couverture `sncf` ils ne servent donc qu'entre une adresse et une gare. Et `co2_emission` change d'unité d'une section à l'autre (`g CO₂e/passenger`, `gEC`) : à vérifier avant tout cumul.

## Prochains départs d'une gare

```
GET /coverage/sncf/stop_areas/stop_area:SNCF:87481002/departures
    ?from_datetime=20260925T173000&count=10&data_freshness=realtime
```

`departures[]` avec `stop_date_time.departure_date_time` et `base_departure_date_time` : le retard se lit dans l'écart.

## Perturbations

```
GET /coverage/sncf/stop_areas/stop_area:SNCF:87481002/traffic_reports
GET /coverage/sncf/disruptions?count=25
```

Un tableau `disruptions` vide signifie qu'il n'y a rien en cours, pas que l'appel a échoué. Chaque perturbation porte `severity`, `messages[].text`, `impacted_objects`. Le 25/09 il n'y aura peut-être aucune perturbation exploitable au moment de la démo : prévoyez le cas.

Autres endpoints disponibles sous `/coverage/sncf/` : `stop_schedules`, `route_schedules`, `terminus_schedules`, `places_nearby`, `isochrones`, `equipment_reports`, `vehicle_journeys`, `line_reports`, `pt_objects`, `addresses`, `coords`, `poi`. La liste complète a été relevée le 14/09.


## SNCF Open Data — gares, stationnement vélo, accessibilité

| | |
|---|---|
| Base | `https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/{dataset}/records` |
| Auth | aucune |
| CORS | OK, testé le 10/09/2026 |
| Licence | ODbL — la source doit être citée dans la démo |
| Réserve | le domaine ne répondait pas le 15/09/2026 depuis l'atelier (deux tentatives, timeout). À re-tester le jour J ; en cas d'échec, `data/samples/nantes-gare-sample.json` couvre Nantes. |

Le filtre utilise ODSQL, passé en paramètre `where` : `where=code_gare="NTS"`, `where=nom like "Nantes"`, `where=codes_uic in ("87481002","87471003")`. Ajoutez `select` pour ne ramener que les champs utiles et `limit` pour borner (100 maximum par page).

## Référentiel des gares — `gares-de-voyageurs`

2 782 gares, mise à jour quotidienne. Champs utiles : `id` (UUID), `nom`, `libellecourt` (le trigramme, `NTS` pour Nantes), `codes_uic`, `segment_drg` (A, B ou C selon la taille), `position_geographique` (`{lon, lat}`), `codeinsee`.

C'est la table de passage du kit. Les clés de jointure ne sont pas les mêmes d'un jeu à l'autre, et c'est le principal piège des jeux SNCF :

| Jeu cible | Champ de jointure | Valeur à utiliser |
|---|---|---|
| `etat-fonctionnement-elevatique-gare` | `gareid` | l'`id` UUID |
| `assistance-psh-pmr` | `id_gare` | l'`id` UUID |
| `equipements-accessibilite-en-gare` | `uic` | `codes_uic` |
| `stationnement-securise-velo-en-gare-au-30-06-24` | `code_gare` | `libellecourt` (trigramme) |

Exemple complet :

```
GET /gares-de-voyageurs/records?where=codes_uic%3D%2287481002%22&limit=1
    &select=id,nom,libellecourt,codes_uic,segment_drg,position_geographique
```

Pour Nantes : `id` = `77474ee2-1c30-4740-a579-b52c2bc74d89`, UIC `87481002`, trigramme `NTS`, segment A, position `-1.542356 / 47.216148`.

## Stationnement vélo sécurisé — `stationnement-securise-velo-en-gare-au-30-06-24`

```
GET /stationnement-securise-velo-en-gare-au-30-06-24/records?where=code_gare%3D%22NTS%22&limit=1
```

Champs : `code_gare`, `nombre_places_au_06_24`, `nombre_places_au_12_24`, `gare_lom_hors_lom`, `objectif_decret_lom`.

Deux limites à dire à l'écran si vous affichez ce chiffre : c'est un **nombre de places**, jamais une disponibilité, et la donnée est **statique**, dernière valeur au 31/12/2024. Repères Pays de la Loire au 12/24 : Nantes 883 (objectif LOM 640), Angers Saint-Laud 299, Le Mans 260, Savenay 122, Clisson 96, La Roche-sur-Yon 80, Ancenis 68, Saumur 64, La Baule 62, Saint-Nazaire 56, Sablé 53, Cholet 48, Pontchâteau 43, Laval 40, Sainte-Pazanne 40.

## État des ascenseurs et escalators — `etat-fonctionnement-elevatique-gare`

2 668 équipements, mise à jour horaire côté source. Champs : `libelle` (« ascenseur - Quai B »), `localisationdescriptive` (« mezzanine / Voies 2 et 3 »), `etat_de_fonctionnement` (`OK`, `KO`, `INCONNU` ou vide), `position_geographique`.

Utile ici parce qu'un ascenseur en panne, avec un vélo chargé, change la faisabilité d'un parcours en gare. Attention, `position_geographique` est annoncée comme supprimée d'ici fin été 2026 (bascule NeTEx) : vérifiez sa présence la veille, et prévoyez de vous rabattre sur `localisationdescriptive` en texte.

## Assistance en gare — `assistance-psh-pmr`

Champs : `typepriseencharge` (« RESERVE ET SPONTANE »), `typetarification` (« GRATUIT »), `lieurendezvousgare`, `horaires_jour_nominal`, `premierauderniertrain`, `datestatut`. Information affichable telle quelle ; ne construisez pas un déclenchement d'assistance, ce n'est pas un canal opérationnel.

Autres jeux repérés dans l'audit : `equipements-accessibilite-en-gare`, `equipements-accessibilite-sncf`, `accessibilite_gares`, `accompagnement-pmr-gares`. Voir `docs/api-et-datasets.md` §2.5 et §2.6.

## Vélos en libre-service — GBFS

| | |
|---|---|
| Racine Nantes | `https://api.cyclocity.fr/contracts/nantes/gbfs/gbfs.json` |
| Auth | aucune |
| CORS | OK, testé le 15/09/2026 |
| Fraîcheur | temps réel (`ttl` 3 600 s sur le fichier racine seulement) |
| Licence | LOv2 · réseau Naolib / JCDecaux Cyclocity |

GBFS est un standard ouvert : la même mécanique marche pour tout réseau qui le publie. Le fichier racine liste les flux disponibles, deux nous intéressent.

```
gbfs.json                  → data.fr.feeds[] (GBFS 2.x) ou data.feeds[] (GBFS 3.x)
station_information.json   → data.stations[] : station_id, name, lat, lon, capacity
station_status.json        → data.stations[] : station_id, num_bikes_available,
                             num_docks_available, last_reported, is_renting…
```

On fusionne les deux sur `station_id`. En GBFS 3.x, `num_bikes_available` devient `num_vehicles_available` : `DS.gbfsStations()` gère les deux formes, ne réécrivez pas ce test.

Le flux Nantes s'annonce en version 2.3, `system_id` `nantes`, nom `Naolib`, fuseau `Europe/Paris`, contact `developer@jcdecaux.com`. Aucun filtrage géographique n'est possible côté serveur : on récupère toutes les stations et on filtre par distance côté client (`DS.distanceM`).

Autres flux GBFS repérés sur Nantes Métropole, non testés : micromobilité Naolib (vélos et trottinettes en free-floating, opérateur ecovelo), autopartage Citiz.

**À chercher le jour J** : un flux GBFS public existe-t-il pour Rennes (vélo STAR), Angers, Le Mans, Tours, Orléans ? Cherchez sur `transport.data.gouv.fr` (filtre « vélos en libre-service ») ou dans le catalogue `github.com/MobilityData/gbfs`. Le registre `DS.GBFS_CONNUS` est prévu pour être complété. Une ville sans flux n'est pas un bug : c'est une limite à afficher honnêtement.


## Itinéraire vélo — OSRM

| | |
|---|---|
| Base | `https://routing.openstreetmap.de/routed-bike/route/v1/driving/` |
| Auth | aucune |
| CORS | OK, testé le 15/09/2026 |
| Licence | OpenStreetMap, ODbL |
| Réserve | instance de démonstration communautaire, aucune garantie de service ni de quota |

```
GET /routed-bike/route/v1/driving/-1.5424,47.2172;-1.6726,48.1035?overview=false
```

Les coordonnées sont en **`lon,lat`**, séparées par `;`. Le segment `/driving/` dans l'URL est normal malgré le profil vélo : c'est le nom du profil interne d'OSRM.

Réponse : `code: "Ok"` puis `routes[0].distance` (mètres) et `routes[0].duration` (secondes). Avec `?overview=full&geometries=geojson`, `routes[0].geometry` donne un tracé posable sur une carte.

Testé Nantes → Rennes : 130,5 km pour 20 774 s, soit 5 h 46 — ce qui donne une idée du réalisme de l'option « je finis à vélo » sur longue distance. Le calcul ignore le dénivelé, la météo et l'état de la voirie.

Repli si l'instance tombe : distance à vol d'oiseau (`DS.distanceM`), × 1,3 environ pour approcher la distance réelle, à 15 km/h de moyenne. C'est une hypothèse de travail, à afficher comme telle.

Alternative citée par Bertrand Billoud : **Valhalla**, open source, plus riche (dénivelé, profils cyclables), mais à héberger — hors budget d'une journée, et l'intégration par Hove n'est pas gratuite.


## Sources complémentaires

**Base Adresse Nationale** — `https://api-adresse.data.gouv.fr/search/?q=...` — sans clé, CORS OK, licence ouverte. Utile pour partir d'une adresse plutôt que d'une gare. Le GeoJSON renvoie `coordinates` en `[lon, lat]`, dans cet ordre.

**Overpass / OpenStreetMap** — loueurs et réparateurs de vélos (`shop=bicycle`), stationnements (`amenity=bicycle_parking`), consignes autour d'une gare. Sans clé, CORS OK, quotas partagés donc à ne pas marteler. Ce serait la façon la plus rapide d'enrichir une ville sans flux GBFS.

**Réseau urbain Naolib** — GTFS, GTFS-RT (`trip-update`, `alerts`) et SIRI via `transport.data.gouv.fr`, licence LOv2. Pas d'API de calcul d'itinéraire publique : soit vous intégrez un GTFS (lourd pour trois heures), soit vous affichez les prochains passages depuis le GTFS-RT, soit vous renvoyez vers `naolib.fr`.

**Semitan / Okina (SIRI Lite)** — `https://api.okina.fr/gateway/sem/realtime/siri/2.0` avec `stop-monitoring.json`, `stoppoints-discovery.json`, `situation-exchange.json`. Nécessite une `api-key` demandée sur `api.okina.fr`, **validée manuellement** : demande déposée le 14/09, réponse en attente au 15/09. Script de test : `test-api-semitan.html`. Ne construisez rien qui en dépende sans confirmation.

**Car interurbain Aléop** — GTFS avec `bikes_allowed` renseigné (`bike_info_count = 5054`), licence LOv2, plus GTFS-RT. C'est **la seule donnée publique d'emport vélo à bord** du périmètre, et elle concerne les cars, pas les trains. Exploitable seulement par extraction hors ligne du GTFS : si quelqu'un veut s'y coller, c'est un angle que personne n'attend.

**Horaires et temps réel SNCF sans clé** — GTFS (validité 2026-09-09 → 2027-02-28), GTFS-RT protobuf (`trip-updates`, `service-alerts`) et SIRI Lite XML via `proxy.transport.data.gouv.fr`, CORS OK. Le protobuf demande une bibliothèque de décodage côté client (`gtfs-realtime-bindings`) : plus lourd que Navitia, mais sans clé. Plan de repli si le jeton Navitia pose problème.


## Mode opératoire générique de connexion à une API

### 1. Lire le contrat de l'API

Avant de coder, relever la base URL, les endpoints, la méthode HTTP, les paramètres obligatoires, le format de réponse, l'authentification, les quotas, le CORS, la licence et la fraîcheur des données. Identifier aussi les champs nécessaires au besoin métier et la clé qui permet de relier les réponses entre elles.

### 2. Isoler la configuration

Centraliser les URLs et les options dans une configuration dédiée. Ne jamais commiter une clé, un token ou un mot de passe. Pour un prototype navigateur, demander la clé à l'utilisateur, la conserver uniquement localement si nécessaire et ne jamais lui donner de droits sensibles.

```js
const API_CONFIG = {
    baseUrl: 'https://api.example.com/v1',
    timeoutMs: 8000
};

const apiToken = localStorage.getItem('apiToken');
```

### 3. Construire la requête

Utiliser `URL` et `URLSearchParams` pour encoder les paramètres. Utiliser les en-têtes prévus par le contrat (`Accept`, `Content-Type`, `Authorization`) et respecter la méthode HTTP attendue. Ne jamais concaténer directement des valeurs utilisateur dans une URL ou une requête.

```js
function buildUrl(path, params = {}) {
    const url = new URL(path, `${API_CONFIG.baseUrl}/`);
    Object.entries(params).forEach(([name, value]) => {
        if (value !== undefined && value !== null) url.searchParams.set(name, value);
    });
    return url;
}
```

### 4. Centraliser l'appel réseau

Un wrapper commun doit gérer le timeout, les erreurs HTTP, le décodage du format annoncé et les réponses vides. Ne pas considérer une liste vide comme une erreur : elle peut signifier qu'aucun résultat n'est disponible.

```js
async function requestJson(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? API_CONFIG.timeoutMs
    );

    try {
        const response = await fetch(buildUrl(path, options.params), {
            method: options.method ?? 'GET',
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                ...options.headers
            },
            body: options.body
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}
```

### 5. Authentifier selon le contrat

Appliquer le mécanisme documenté par l'API : clé dans un en-tête, Bearer token, HTTP Basic ou paramètre de requête. Ne pas inventer de méthode d'authentification et ne pas afficher le secret dans les logs, les messages d'erreur ou l'interface.

```js
const response = await requestJson('/resource', {
    headers: { Authorization: `Bearer ${apiToken}` },
    params: { limit: 20 }
});
```

### 6. Valider et normaliser la réponse

Vérifier la présence du statut annoncé par l'API, du tableau ou de l'objet attendu et des champs indispensables. Convertir les dates, coordonnées, durées et unités à un format interne unique. Préserver les informations de fraîcheur et de source pour les afficher avec le résultat.

```js
function normalizeItems(payload) {
    if (!Array.isArray(payload.items)) return [];
    return payload.items.map(item => ({
        id: String(item.id),
        name: item.name ?? 'Sans nom'
    }));
}
```

### 7. Prévoir les erreurs et le repli

Distinguer une erreur réseau, une erreur d'authentification, une limitation de quota, une réponse vide et une réponse invalide. Utiliser un échantillon local ou un calcul de repli documenté si la donnée réelle est indisponible, et l'indiquer explicitement comme `live`, `sample`, `empty` ou `error`.

```js
async function loadWithFallback(loadLive, sample) {
    try {
        return { status: 'live', data: await loadLive() };
    } catch (error) {
        console.warn('API indisponible, utilisation du repli', error.message);
        return { status: 'sample', data: sample };
    }
}
```

### 8. Tester et documenter

Tester d'abord l'endpoint avec un cas nominal, puis avec un paramètre invalide, une réponse vide, un token absent, un timeout et le réseau coupé. Vérifier le CORS depuis l'environnement réel, les quotas, les limites de pagination et les conditions de licence. Enregistrer des échantillons avant une démonstration et afficher la source, la date de mise à jour, la licence et les hypothèses. Ne jamais bloquer l'application entière sur une seule API.

---

## Règles de jeu sur les données

Citer la source et la fraîcheur de chaque donnée affichée, avec sa licence (ODbL pour SNCF Open Data et OSM, LOv2 pour Naolib et Aléop). Distinguer à l'écran ce qui est réel, ce qui est simulé, ce qui est une hypothèse et ce qui manque. Ne jamais présenter une donnée statique de 2024 comme du temps réel. Aucun secret dans le dépôt : le token Navitia se colle dans le navigateur et reste dans le stockage local, `.env` est ignoré par Git, seul `.env.example` est versionné. Pas de donnée personnelle, pas de compte, pas de géolocalisation obligatoire. Et enregistrez vos échantillons la veille dans `data/samples/` : une API qui tombe pendant la restitution ne doit pas emporter la démo.

---

Audit d'origine et fiches complètes par source : `docs/api-et-datasets.md` · registre des 33 sources qualifiées : `docs/registre-sources.csv` · matière métier et pistes : `docs/brief-jour-j.md`.
