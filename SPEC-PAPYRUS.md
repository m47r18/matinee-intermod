# PAPYRUS — Le copilote des agents en gare

Spec fonctionnelle consolidée, Hack the Vibe — Nantes Digital Week, 25/09/2026.

## Positionnement

Application métier pour l'**agent de gare** (pôle d'échange multimodal, pas l'agent à bord des trains). L'agent reste au centre, l'IA prépare la réponse. Cible voyageurs : les personnes peu à l'aise avec le numérique (personnes âgées, familles, voyageurs sans téléphone) et les cyclistes récents ou à convertir, plutôt que les cyclistes aguerris. Le cadre reste général : la communication entre l'agent et le voyageur, les personas servant d'exemples.

Scénario principal : **TER supprimé, remplacé par un car de substitution qui refuse les vélos.** Le cycliste reste bloqué pendant que les autres voyageurs repartent.

## Problème à résoudre

Chaque jour, les agents en gare reçoivent des dizaines de demandes : train annulé, vélo à gérer, consigne, réparation vélo, transport disponible, hôtel, attente longue. Aujourd'hui l'information est dispersée, l'agent doit chercher dans plusieurs outils, le voyageur oublie souvent les consignes reçues, et plusieurs voyageurs posent les mêmes questions.

## Fonctionnalités

- **F1 — Contexte gare en temps réel** : départs réels de Nantes (Navitia), incident en cours, points vélo réels autour de la gare (parkings sécurisés, consignes, stations de réparation : OSM, open data Nantes, Naolib).
- **F2 — Demande et compréhension** : l'agent demande l'accord du voyageur (« je transcris notre échange pour vous aider, rien n'est enregistré »), puis dicte ou tape la demande. L'IA en extrait destination, contraintes (vélo, famille, bagages), urgence et profil. L'agent corrige si besoin.
- **F3 — Solutions fondées sur les données** : 2 ou 3 options avec des critères lisibles (vélo accepté ou non, heure d'arrivée, correspondances, information temps réel ou théorique). Pas de score en pourcentage. L'IA ne rédige qu'à partir des données récupérées, elle n'invente aucun horaire. L'agent choisit l'option.
- **F4 — Restitution adaptée au profil** : ticket thermique imprimé (voyageur peu à l'aise avec le numérique), QR code vers un mini-guide web (voyageur à l'aise), SMS ou mail (écran simulé). Le ticket imprimé est le moment fort de la démo.
- **F5 — Vue d'ensemble de la gare** : PAPYRUS agrège les demandes de la journée (« 7 voyageurs vélo concernés par la suppression du 14h32 ») et propose un message commun : annonce, affichage, SMS groupé. C'est l'argument qui distingue PAPYRUS d'un simple assistant.
- **F6 — Attente longue (bonus)** : suggestions en ville pour une famille qui a 4 heures devant elle.
- **F7 — Débrief de fin de journée** : l'IA présente à l'agent ce qu'elle a retenu du service (demandes récurrentes, problèmes constatés). L'agent corrige et valide, et la mémoire de la gare s'enrichit pour l'équipe suivante. Seul ce qu'un humain a validé entre en mémoire.

Hors périmètre : scénario hôtel (trop proche d'un GPS), météo sur le tableau de bord, scores en pourcentage.

## Personas

- **Vélo-tafeur** : rapidité, plan B, stationnement vélo
- **Cyclotouriste** : stockage vélo, hébergement, consignes, itinéraires
- **Famille** : simplicité, accompagnement, étapes claires
- **Voyageur occasionnel** : découverte de la ville, compréhension des transports
- **Voyageur peu à l'aise avec le numérique** : support papier, accompagnement humain

## Mode démo

Données réelles pour Navitia, Naolib et l'open data. Seul l'incident est injecté (suppression du 14h32 vers Pornic), car rien ne garantit une perturbation réelle au moment de la démo. Un bandeau discret signale l'incident simulé.

### Jeu de rôle avec un participant du public

1. Mise en scène : « Vous êtes en gare de Nantes, il est 14h35, votre TER vient d'être supprimé. Quel est votre problème ? »
2. Consentement affiché à l'écran, puis transcript en direct pendant l'échange libre (environ 1 min).
3. Compréhension affichée et corrigée par l'agent, puis solutions construites sur les vraies données.
4. Ticket imprimé remis au participant, ou QR code s'il est à l'aise avec le numérique.

Parades prévues :
- **Salle bruyante** : micro-cravate ou téléphone tenu près de la bouche, saisie au clavier en secours.
- **Problème hors sujet** : PAPYRUS oriente vers l'accueil au lieu d'inventer une réponse.
- **Participant qui sèche** : fiche de cadrage avec 3 idées de problèmes.
- **Latence** : affichage des étapes en cours.
- **Aucune solution dans les données** : repli systématique vers l'agent humain ou l'accueil.

Plan B si personne ne se porte volontaire : jeu de rôle entre membres de l'équipe.

### Déroulé, 5 minutes

- **0:00** : le problème (car de substitution qui refuse les vélos) et l'écran agent (F1).
- **0:45** : jeu de rôle avec le participant (F2, F3, F4), ticket remis en main propre.
- **2:45** : vue d'ensemble de la gare (F5), message commun proposé.
- **3:30** : débrief de fin de journée (F7).
- **4:15** : phrase finale : « Quand un voyageur pose une question, l'agent ne cherche plus une information. Il construit instantanément un parcours personnalisé. »

## Écrans à développer

- **Écran 1 — Dashboard Agent** : incidents en cours, contexte gare, bouton nouvelle demande
- **Écran 2 — Assistant Conversation** : interface type ChatGPT ; à gauche l'historique, au centre la conversation ; champ « Décrivez le besoin du voyageur... »
- **Écran 3 — Analyse** : carte synthèse avec persona détecté, situation, contraintes
- **Écran 4 — Solutions** : liste de cartes présentant les options (sans score en pourcentage)
- **Écran 5 — Restitution** : boutons Générer QR Code, Envoyer SMS, Envoyer e-mail, Imprimer ticket

## Style visuel

Inspirations : SNCF Connect, Copilot, Notion, Citymapper. Design moderne, minimaliste, premium. Couleurs : bleu SNCF, blanc, vert mobilité douce.

## Stack technique

- **Hébergement** : Vercel relié au dépôt GitHub. HTTPS automatique (obligatoire pour le micro et le Bluetooth), une URL de préversion par branche.
- **Front** : NextJS, Tailwind, TypeScript. Une page « poste agent » ouverte dans Chrome sur un téléphone Android.
- **Backend** : API routes NextJS. `/api/comprendre` (transcript → JSON structuré) et `/api/solutions` (données réelles → options rédigées).
- **LLM** : Claude via le SDK `@anthropic-ai/sdk`, modèle `claude-opus-5` (`claude-sonnet-5` si la latence gêne), sortie JSON structurée.
- **Clés** : `ANTHROPIC_API_KEY` et `NAVITIA_KEY` en variables d'environnement Vercel, jamais dans la page ni dans le dépôt. Plafond de dépense à poser dans la console Anthropic.
- **Micro** : Web Speech API de Chrome. Le son transite par Google ; une transcription maîtrisée (Whisper ou équivalent) serait nécessaire pour tenir strictement la promesse « rien n'est conservé ».
- **Imprimante** : Phomemo M02 ou M02S pilotée en Web Bluetooth depuis la page (ticket rendu en image de 384 px, protocole repris de Phomymo). Avec une Peripage A6 : serveur d'impression Python sur un PC Linux, ou application officielle en repli.
- **Données** : Navitia, open data Nantes et Overpass appelés côté serveur. Points vélo autour de la gare précalculés en JSON dans le dépôt, Overpass étant lent et capricieux.

## Reste à décider

- [ ] Nom définitif du produit (PAPYRUS est provisoire)
- [ ] Imprimante achetée à la Fnac (Phomemo ou Peripage), qui fixe la solution d'impression
- [ ] Qui fournit la clé Anthropic, et plafond de dépense
- [ ] Claude ou autre LLM
- [ ] Répartition des user stories entre les quatre membres de l'équipe
