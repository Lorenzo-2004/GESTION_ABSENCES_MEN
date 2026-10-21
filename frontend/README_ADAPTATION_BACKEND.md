# Audit du nouveau backend MEN et adaptation du frontend

Date : 21 octobre 2026

## Logique backend vérifiée dans les archives

- **Types d'absence** : le backend ne déclare que `CONGE_ANNUEL`, `PERMISSION`, `AUTORISATION`, `MISSION`, `MATERNITE`, `PATERNITE` et `REPOS_SANITAIRE`. Aucun type supplémentaire n'a été ajouté.
- **Maternité / paternité** : le champ d'entrée est `date_evenement_prevue`. `conges.regles.periode_automatique()` calcule les dates incluses : début le jour prévu de l'événement selon la configuration du backend, puis 90 jours calendaires pour la maternité ou 15 pour la paternité. Le frontend montre ces valeurs en lecture seule et ne transmet plus les champs `date_debut` et `date_fin` pour ces deux types.
- **Justificatifs** : `JUSTIFICATIF_OBLIGATOIRE` est vide dans le backend consulté. Le fichier est facultatif et les formats sont PDF/JPG/JPEG/PNG/TIF/TIFF, limite 15 Mio. Le frontend est aligné sur cette taille et ces formats.
- **Formulaire officiel** : le backend vérifie la présence du personnel, IM, corps, grade, service ou direction, dates, motif et lieu de jouissance avant de créer un dossier imprimable. Le frontend exige maintenant motif et lieu. Les informations personnelles sont prises dans la fiche personnel renvoyée par l'API, plutôt que ressaisies dans la demande.
- **Éligibilité** : le backend rejette certaines demandes selon le statut stagiaire et réserve la maternité/paternité selon le sexe. Le frontend filtre ces choix lorsque le profil du personnel est connu ; le backend demeure le contrôle définitif.
- **Délais et quotas** : les validations restent appliquées par le backend : congé annuel entre 14 et 30 jours avant son début, mission au moins 7 jours avant son début, maternité 1 à 3 mois avant la date prévue, paternité 14 à 30 jours avant, plafonds des permissions et autorisations, chevauchements et disponibilité du solde annuel.
- **Décision RH / solde annuel** : une décision de congé annuel est enregistrée puis activée côté RH pour ouvrir les droits. Le frontend conserve cette activation et consomme l'API des droits annuels.
- **Report des reliquats** : la création d'un nouveau solde importe le reliquat de l'année précédente ; les modifications du solde se propagent en cascade aux soldes des années suivantes déjà existants. Le bouton RH `reporter-reliquats` reste nécessaire pour recalculer/rattraper des soldes N+1 existants : il ne remplace pas la propagation automatique quotidienne.
- **PDF officiel** : la génération et les soulignements appartiennent au service backend `conges/services/pdf.py`. Le frontend continue d'utiliser l'endpoint `/api/demandes/{id}/formulaire/` ; il ne reproduit pas le PDF côté navigateur.
- **OCR RH** : `/api/decisions/scan/` renvoie les données extraites, l'agent reconnu, les champs manquants, les avertissements et le signalement d'un numéro déjà utilisé. Ces données sont maintenant visibles et un numéro du scan déjà existant bloque l'envoi tant que le numéro reste identique.
- **Espace RH → service** : le backend exige un service pour le planning RH et renvoie une file vide pour un RH sans service. Le frontend masque les liens du service lorsqu'aucun rattachement n'existe ; si le tableau de bord service est ouvert directement, une explication et un retour à l'espace RH sont affichés.

## Fichiers frontend adaptés

- `src/pages/agent/NouvelleDemandePage.tsx` : dates automatiques en lecture seule, validation des champs nécessaires au PDF, justificatif facultatif, limite de 15 Mo et filtres d'éligibilité.
- `src/services/nouvelleDemandeService.ts` : dates facultatives dans le contrat et omission de début/fin dans la requête maternité/paternité ; les autres champs envoyés correspondent aux champs connus du sérialiseur.
- `src/services/chefServiceService.ts` : expose statut et sexe pour appliquer les règles d'éligibilité d'une demande pour un agent.
- `src/services/rhDecisionsService.ts` : enrichissement des types de réponse OCR sans modifier les URL existantes.
- `src/pages/rh/DecisionsRHPage.tsx` : affichage des valeurs OCR, des champs manquants, avertissements et doublons ; plafond de 15 Mo ; explication du report automatique.
- `src/components/men/miseEnPageRH.tsx` : navigation de service conditionnée par le rattachement RH.
- `src/pages/chef-service/DashboardChefServicePage.tsx` : message explicite pour un RH non rattaché à un service et lien de retour.

## Vérification

- Le contrôle syntaxique des fichiers TypeScript/TSX n’a révélé aucune erreur. La compilation TypeScript complète n’a pas pu être relancée sur cette livraison, car les dépendances npm ne sont pas disponibles dans l’environnement actuel.
- Le build Vite complet n’a pas été confirmé, car l’installation des dépendances npm n’a pas abouti dans cet environnement. Sur Windows, dans le dossier frontend :

```powershell
npm ci
npm run build
```

L'audit est basé sur les fichiers source des deux archives ; je n'ai pas exécuté de test d'intégration contre une instance Django/PostgreSQL en fonctionnement.
