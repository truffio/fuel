# Spécification — Prototype web de suivi de consommation d’essence

**Version :** 1.0 — 5 novembre 2026  
**Statut :** Spécification pour implémentation d’un prototype (MVP)

## 1. Objectif

Créer une application web simple permettant à un conducteur de consigner chaque plein d’essence, puis de consulter l’évolution de la consommation et des dépenses liées au carburant de son véhicule.

Le prototype doit valider les fonctionnalités et l’ergonomie avant une éventuelle adaptation en application mobile. Il doit fonctionner directement dans un navigateur, sans installation et sans serveur.

## 2. Portée et principes

- **Un seul véhicule** dans la première version.
- Enregistrement manuel des pleins d’essence.
- Calcul automatique des distances parcourues entre pleins, de la consommation moyenne et des dépenses.
- Graphique chronologique montrant **un point par plein enregistré**, avec une métrique sélectionnable.
- Historique consultable, modifiable et supprimable.
- Stockage local persistant dans le navigateur (`localStorage`).
- Présentation en français; devise CAD, kilométrage en km, essence en litres.
- Interface responsive utilisable sur ordinateur et téléphone.
- Aucun compte utilisateur, serveur, base de données distante ou service externe requis.

### Hypothèse fondamentale de mesure

Pour que l’essence ajoutée au plein courant représente approximativement l’essence consommée depuis le plein précédent, **les deux pleins doivent être complets (réservoir rempli à niveau comparable)**. La consommation calculée est inexacte pour des pleins partiels. Dans ce MVP, l’interface affiche cette hypothèse et demande de confirmer que le plein est complet. Ne pas calculer de consommation pour un plein partiel sans concevoir une méthode spécifique.

## 3. Flux principal

1. L’utilisateur ouvre l’application et consulte le tableau de bord.
2. Lorsqu’il fait un plein, il choisit « Ajouter un plein ».
3. Il renseigne la **date du plein**, le **kilométrage total du compteur (odomètre)**, le **volume ajouté en litres** et le **prix du litre en CAD**. Il confirme que le plein est complet.
4. L’application valide les données, enregistre le plein et calcule le **coût du plein**.
5. Dès le **deuxième plein complet consécutif**, l’application calcule la distance depuis le plein précédent, puis la consommation de l’intervalle.
6. Le tableau de bord, l’historique et le graphique sont mis à jour immédiatement.
7. L’utilisateur peut choisir la métrique affichée sur le graphique, consulter le détail d’un plein, corriger une entrée ou la supprimer.

**Important :** l’utilisateur ne saisit jamais la distance depuis le dernier plein. Il entre uniquement le kilométrage total du véhicule; la différence est calculée automatiquement.

## 4. Données à saisir

| Champ | Type | Unité | Obligatoire | Règle |
|---|---|---|---|---|
| Date du plein | Date locale (YYYY-MM-DD) | — | Oui | Date réelle; par défaut aujourd’hui |
| Odomètre | Nombre | km | Oui | ≥ 0; supérieur à celui du plein précédent |
| Essence ajoutée | Nombre décimal | L | Oui | > 0 |
| Prix unitaire | Nombre décimal | CAD/L | Oui | > 0 |
| Plein complet | Case à cocher | — | Oui | Doit être confirmé pour le calcul de consommation du MVP |

Les champs numériques acceptent les décimales, et l’interface peut accepter une virgule comme séparateur décimal. Stocker des **nombres**, et non des chaînes formatées. Les coûts affichés sont arrondis à deux décimales; les calculs intermédiaires gardent leur précision.

## 5. Règles de calcul

Pour chaque plein `i`, ordonné chronologiquement (date, puis odomètre) :

- `coutPlein[i] = litres[i] × prixParLitre[i]`
- `depenseCumulee[i] = somme(coutPlein[j] pour j = 0..i)`
- Pour `i ≥ 1` : `distance[i] = odometre[i] − odometre[i−1]`
- Pour `i ≥ 1` lorsque les deux pleins sont complets et `distance[i] > 0` :
  - `rendementKmParL[i] = distance[i] / litres[i]`
  - `consommationLPar100Km[i] = (litres[i] / distance[i]) × 100` (indicateur complémentaire facultatif)

### Cas du premier plein

Le premier plein constitue le **point de référence de l’odomètre**. Son coût compte dans les dépenses cumulées, mais aucune distance ni consommation ne peut être calculée pour ce premier plein. Afficher « — » plutôt que zéro. Le graphique des rendements commence au deuxième plein; celui du prix au litre et celui des dépenses cumulées comprennent le premier plein.

### Pleins partiels

Ce MVP impose des pleins complets. S’il faut gérer des pleins partiels ultérieurement, définir séparément l’algorithme d’accumulation des litres jusqu’au prochain plein complet. **Ne pas** assimiler directement les litres d’un plein partiel à la consommation de l’intervalle.

### Exemple de référence

| Plein | Odomètre (km) | Volume (L) | Prix (CAD/L) | Distance (km) | Rendement (km/L) | Coût (CAD) | Cumul (CAD) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 10 000 | 40 | 1,60 | — | — | 64,00 | 64,00 |
| 2 | 10 500 | 40 | 1,70 | 500 | 12,50 | 68,00 | 132,00 |
| 3 | 10 920 | 35 | 1,65 | 420 | 12,00 | 57,75 | 189,75 |

## 6. Fonctionnalités de l’interface

### 6.1 Tableau de bord

Afficher au minimum :
- Total dépensé en essence depuis le premier plein enregistré (CAD).
- Nombre de pleins enregistrés.
- Distance totale connue depuis le premier plein (dernier odomètre − premier odomètre).
- Rendement global pondéré par les volumes des intervalles valides : `somme(distances) / somme(litres correspondants)`; ne pas calculer une moyenne arithmétique des rendements individuels.
- Accès visible à « Ajouter un plein ».

Aucun indicateur de consommation n’est affiché comme valide avant le deuxième plein.

### 6.2 Formulaire « Ajouter / Modifier un plein »

Champs définis à la section 4. Afficher des libellés avec unités, les erreurs de validation à proximité des champs et un bouton « Enregistrer »; en édition, « Enregistrer les modifications » et « Annuler ».

### 6.3 Graphique interactif

Créer **un seul graphique principal** à points reliés chronologiquement par une ligne (la ligne est facultative, les points sont obligatoires). Chaque point correspond à un plein admissible pour la métrique affichée. Prévoir un sélecteur avec ces trois métriques :

1. **Prix du litre** — ordonnée en CAD/L, tous les pleins.
2. **Rendement du dernier intervalle** — ordonnée en km/L, à partir du deuxième plein; cet indicateur est calculé en associant le volume ajouté au plein courant à la distance depuis le plein précédent.
3. **Dépenses cumulées** — ordonnée en CAD, depuis le premier plein.

L’axe horizontal représente les dates des pleins, dans l’ordre chronologique. En cas de plusieurs pleins à la même date, les points doivent rester distincts (par exemple à l’aide de l’ordre des enregistrements). Au survol ou au toucher d’un point, afficher une info-bulle indiquant date, odomètre et valeur de la métrique choisie. Afficher une indication « Pas encore assez de données » si la métrique ne peut être calculée.

**Technologie du graphique :** utiliser SVG natif ou Canvas 2D avec JavaScript vanilla. Éviter toute dépendance externe pour conserver un prototype autonome.

### 6.4 Historique des pleins

Afficher un tableau ou une liste adaptée au mobile, trié de l’ancien au plus récent (ou inversement avec indication claire), contenant date, odomètre, litres, prix/L, coût, distance depuis le précédent plein, rendement km/L et dépenses cumulées. Permettre de modifier ou supprimer une entrée avec confirmation avant suppression.

### 6.5 État vide

Lorsque aucun plein n’existe : montrer une explication courte et le bouton « Ajouter le premier plein ». Après le premier plein, expliquer qu’un deuxième plein est nécessaire pour calculer la consommation.

## 7. Validation, modifications et recalculs

- Les valeurs numériques doivent être finies et respecter les bornes précisées.
- L’odomètre doit augmenter strictement dans l’ordre des pleins; refuser ou signaler une entrée qui brise cette progression.
- Les dates doivent conserver l’ordre logique des saisies; un nouveau plein peut être inséré dans l’historique, pourvu que les valeurs d’odomètre restent cohérentes.
- Si un plein est modifié ou supprimé, **recalculer tous les indicateurs dérivés** (distances, rendements, coûts cumulés et graphiques) à partir de la liste des données brutes.
- Après suppression du premier plein, le plein suivant devient la nouvelle référence sans valeur de rendement.
- Après suppression de n’importe quel plein intermédiaire, calculer la distance entre les pleins désormais adjacents; signaler que le volume du plein suivant ne représente plus nécessairement toute l’essence consommée sur cet intervalle. **Pour éviter un résultat trompeur dans le MVP, masquer le rendement de cet intervalle après cette suppression**, jusqu’à rétablissement de données cohérentes. Une implémentation simple peut interdire la suppression intermédiaire, ou la rendre possible avec un avertissement et un marqueur d’intervalle non calculable.

## 8. Modèle de données

Enregistrer uniquement les données brutes et les métadonnées nécessaires; recalculer les métriques dérivées à l’affichage.

```json
{
  "schemaVersion": 1,
  "vehicle": { "id": "default", "name": "Mon véhicule" },
  "fills": [
    {
      "id": "uuid-unique",
      "date": "2026-11-05",
      "odometerKm": 10000,
      "liters": 40,
      "pricePerLiterCad": 1.60,
      "fullTank": true,
      "createdAt": "2026-11-05T18:00:00.000Z"
    }
  ],
  "ui": { "chartMetric": "pricePerLiter" }
}
```

Clé suggérée : `vehicleFuelTracker.v1`. Écrire des fonctions de lecture/écriture qui tolèrent l’absence de données et récupèrent proprement les erreurs de JSON corrompu; prévenir l’utilisateur en cas d’impossibilité d’enregistrer. `id` est un identifiant stable généré à la création, jamais l’index d’un tableau.

## 9. Architecture technique proposée

**Contraintes obligatoires :** HTML5, CSS3 et JavaScript vanilla (ES modules permis); **aucun** React, Vue, Svelte, TypeScript, bundler, serveur ni backend.

Structure suggérée :

```text
index.html
styles.css
js/
  app.js          # démarrage, état, orchestration
  storage.js      # persistence localStorage
  calculations.js # logique pure et testable
  validation.js   # validation des entrées
  chart.js        # affichage du graphique natif
  ui.js           # formulaire, tableau, indicateurs
README.md
```

L’application doit s’ouvrir via un serveur HTTP local statique simple (ex. `python -m http.server`) pour que les modules JavaScript fonctionnent sans restrictions `file://`. Aucun accès réseau nécessaire à son exécution.

### Responsabilités

- `calculations.js` : reçoit la liste des pleins; retourne des enregistrements enrichis et les agrégats, sans modifier les données sources.
- `validation.js` : contrôle la saisie et la cohérence avec les pleins existants.
- `storage.js` : charge et sauvegarde les données locales.
- `chart.js` : rend le graphique selon la métrique et la liste de points.
- `ui.js` : rafraîchit les éléments du DOM et gère les interactions utilisateur.
- `app.js` : relie les événements, recalcule puis met à jour l’interface.

## 10. Design et ergonomie

- Mise en page claire, responsive, pensée pour un écran de téléphone aussi bien que pour ordinateur.
- Boutons et champs utilisables au toucher.
- Présentation cohérente des unités et du format monétaire francophone (ex. `1,65 $/L`).
- Axes de graphique lisibles et info-bulles accessibles au clavier autant que possible.
- Étiquettes associées aux champs et erreurs expliquées en texte; ne pas compter uniquement sur la couleur.
- Ne jamais effacer silencieusement les données locales.

## 11. Hors portée de ce prototype

- Application native iOS ou Android et synchronisation multidevice.
- Comptes utilisateurs, authentification et serveur.
- Plusieurs véhicules.
- Reconnaissance de reçus, GPS, saisie automatique par l’ordinateur de bord.
- Suivi des autres dépenses du véhicule (entretien, assurance, etc.).
- Gestion avancée des pleins partiels.
- Exportation/importation et sauvegarde infonuagique (évolutions possibles).

## 12. Critères d’acceptation

1. Au premier lancement, l’application affiche un état vide compréhensible.
2. Le premier plein se sauvegarde et affiche son coût, son prix au litre et sa dépense cumulée, sans inventer de consommation.
3. Avec les données du tableau d’exemple, la deuxième entrée produit 500 km, 12,50 km/L, 68,00 CAD et 132,00 CAD cumulés.
4. La troisième entrée produit 420 km, 12,00 km/L, 57,75 CAD et 189,75 CAD cumulés.
5. Les trois métriques du graphique sont sélectionnables et les points montrent les valeurs appropriées.
6. La courbe de rendement ne contient pas de point pour le premier plein; les deux autres courbes le contiennent.
7. Une saisie invalide est refusée avec un message compréhensible.
8. Une modification répercute correctement les calculs sur toutes les entrées concernées.
9. Une suppression ne produit pas de rendement artificiel pour un intervalle dont la mesure est devenue incohérente.
10. Après fermeture et réouverture de la page dans le même navigateur, les données saisies restent présentes.
11. L’interface est utilisable sur un écran mobile, sans défilement horizontal imposé pour le formulaire ou le graphique.
12. Le prototype fonctionne sans aucune bibliothèque JavaScript tierce.

## 13. Consignes à l’IA chargée de l’implémentation

Implémenter le MVP complet en respectant cette spécification. Fournir tous les fichiers source, ainsi qu’un `README.md` indiquant comment lancer le prototype avec un serveur local statique et comment tester les principales fonctions. Séparer la logique de calcul du DOM pour permettre des tests simples. Ajouter des tests automatisés minimaux (ou une page/script de tests utilisant les assertions natives) pour le cas de référence et le premier plein. Ne pas ajouter de fonctionnalités hors portée sans demande explicite. En cas d’ambiguïté, privilégier l’intégrité des données et l’absence de métriques trompeuses; documenter la décision.
