# Toolbox
Boîte à outils contenant toutes sortes d’outils utiles au quotidien

# Contexte général

Le projet contient 3 studios distincts en JSX et un index.html qui sert de vitrine/front d’accès.
L’objectif est de transformer la vitrine actuelle, aujourd’hui mono-studio, en vitrine multi-studios.

## État actuel du HTML

Le fichier index.html monte uniquement un composant React nommé window.ImageEditor, chargé via un script Babel externe "./image-editor.jsx".
Autrement dit :
- il n’existe aujourd’hui qu’un seul point d’entrée actif dans la page ;
- ce point d’entrée correspond au studio image ;
- la page n’est pas encore conçue comme un shell applicatif multi-outils ;
- le titre et le montage sont orientés “éditeur d’image”, pas “suite de studios”.

## Architecture logique attendue

Il faut penser l’application comme :
- un shell HTML unique ;
- une navigation principale entre studios ;
- une zone de rendu centrale ;
- un mapping entre un identifiant de studio et le composant à afficher ;
- une couche de style commune, minimaliste, cohérente, indépendante du style interne de chaque studio.

# Détail des outils

1) Vision Studio
Rôle :
- éditeur visuel / image editor orienté composition sur canvas.

Ce que fait l’outil :
- gère un canvas de travail avec dimensions configurables ;
- importe des images ;
- crée et gère des calques ;
- permet d’ajouter du texte ;
- permet d’ajouter des formes simples (rectangle, cercle, ligne) ;
- permet déplacement, redimensionnement, rotation logique, flips, opacité ;
- expose des réglages d’image (luminosité, contraste, saturation) ;
- gère l’ordre des calques, la visibilité, la suppression, la duplication ;
- gère un historique undo/redo ;
- exporte en image (png/jpeg/webp selon le code) ;
- propose des templates de formats (story, carré, A4, miniature, etc.).

Structure technique :
- ce studio est écrit pour fonctionner directement dans un contexte React global chargé dans la page ;
- il s’appuie sur const { useState, ... } = React ;
- à la fin il expose explicitement le composant via window.ImageEditor = ImageEditor ;
- c’est donc le studio le plus “plug-and-play” dans le HTML actuel.

2) Record Studio
Rôle :
- enregistreur média navigateur.

Ce que fait l’outil :
- détecte les périphériques audio et vidéo ;
- permet de choisir un mode : audio, vidéo, audio+vidéo ;
- permet de choisir microphone et caméra ;
- ouvre un flux getUserMedia ;
- crée un MediaRecorder avec le meilleur mime type supporté ;
- gère démarrer / pause / reprise / arrêt ;
- accumule les chunks médias ;
- reconstruit un Blob final ;
- génère une URL locale de lecture ;
- permet prévisualisation puis téléchargement du média enregistré.

Structure technique :
- ce studio utilise une syntaxe module React moderne : import { useState... } from "react" ;
- le composant est exporté via export default function MediaRecorderApp() ;
- il n’est pas exposé sur window ;
- il n’est donc pas montable tel quel par le HTML actuel sans adaptation ;
- il faut soit :
  1. le transformer en composant global compatible Babel navigateur,
  2. soit faire évoluer l’index.html vers une approche module/bundler,
  3. soit créer un wrapper qui l’expose sur window.

3) PDF Studio
Rôle :
- éditeur PDF interactif.

Ce que fait l’outil :
- charge dynamiquement pdf.js, fabric.js et pdf-lib ;
- importe un PDF ;
- rend les pages en arrière-plan ;
- superpose un canvas Fabric pour l’annotation/édition ;
- permet sélection, texte, rectangle, ellipse, ligne, flèche, crayon, gomme ;
- stocke séparément les objets par page ;
- gère la navigation entre pages ;
- gère le zoom ;
- permet suppression et réordonnancement des objets ;
- réinjecte les annotations dans le PDF final exporté ;
- permet aussi la fusion de plusieurs PDF dans un document unique.

Structure technique :
- comme Record Studio, ce fichier est écrit en syntaxe module React moderne ;
- il utilise import { useState... } from "react" ;
- il exporte export default function PDFStudio() ;
- il n’est pas exposé sur window ;
- lui aussi nécessite un contrat d’intégration cohérent avant de pouvoir être injecté dans la vitrine HTML existante.

# Squelette d’interaction entre fichiers

## Interaction actuelle :
- index.html charge React, ReactDOM, Babel ;
- index.html charge un seul fichier JSX ;
- index.html monte un seul composant : window.ImageEditor.

## Interaction cible :
- index.html devient un shell d’application ;
- le shell affiche une page d’accueil/landing + navigation des studios ;
- le shell peut afficher :
  - Vision Studio,
  - Record Studio,
  - PDF Studio ;
- chaque studio reste responsable de sa logique métier ;
- le shell ne doit gérer que :
  - la navigation,
  - le layout,
  - la cohérence visuelle,
  - le montage du bon composant.

## Point technique critique
Les trois studios ne partagent pas aujourd’hui le même contrat d’export :
- Vision Studio → composant global via window.ImageEditor ;
- Record Studio → export default ES module ;
- PDF Studio → export default ES module.

Avant de finaliser la vitrine HTML, il faut donc unifier l’intégration.
Le plus simple pour une page HTML autonome sans build step est :
- exposer aussi Record Studio et PDF Studio sur window ;
- puis créer dans index.html un AppShell React qui choisit quel studio afficher.

## Contraintes UI souhaitées
La nouvelle vitrine HTML doit être :
- lisse ;
- propre ;
- minimaliste ;
- claire ;
- premium mais sobre ;
- avec une palette beige/brun donnée.

# Palette à utiliser
--cream:#FAF7F2;
--cream-dark:#F3EDE4;
--sand:#E8DFD1;
--camel:#C4A87C;
--camel-light:#D4BE9A;
--camel-dark:#A8895E;
--brown:#6B5B4E;
--brown-dark:#4A3F35;
--brown-deep:#3A3129;
--text:#3A3129;
--text-light:#7A6E63;
--text-muted:#A69A8E;
--white:#FFF;

# Exigence de résultat
Le HTML final doit devenir une vitrine multi-studios avec :
- header propre ;
- hero court ;
- cartes ou onglets pour les 3 studios ;
- descriptions synthétiques ;
- bouton/interaction pour ouvrir chaque studio ;
- gestion d’état simple du studio actif ;
- intégration effective des 3 composants, pas juste une maquette statique.
