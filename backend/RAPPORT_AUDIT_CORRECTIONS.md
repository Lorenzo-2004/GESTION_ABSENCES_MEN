# Backend MEN — rapport des corrections

Cette archive est une version de travail corrigée du backend Django. Les règles sont alignées sur le cahier des charges fourni (RG-01 à RG-18). La suite Django n'a pas pu être exécutée dans l'environnement d'édition : Django et les dépendances du projet n'y sont pas installés et l'accès réseau d'installation n'est pas disponible. La compilation syntaxique de tous les fichiers Python a en revanche été effectuée.

## Corrections intégrées

### Soldes et congés annuels
- Le report reprend le solde restant de l'année source, lequel inclut déjà les reliquats historiques : le même reliquat n'est pas additionné une deuxième fois.
- Un report peut être relancé sans doubler le report ; les droits annuels et les jours déjà pris sur le solde cible sont préservés.
- L'activation RH refuse les stagiaires et les décisions ne sont pas considérées comme valides avant leur activation explicite.
- Les années de titre sont lues depuis `annees_titre` ; le code n'invente plus l'année d'émission si aucune année exploitable n'est mentionnée.
- L'imputation d'un congé annuel s'appuie sur `annee_titre`. Le contrôle de solde exclut la demande en cours de ses propres jours engagés, notamment lorsque la vue l'a déjà enregistrée avant d'appeler le service.
- La règle historique qui imposait une première tranche de 15 jours a été supprimée : cette exigence n'est pas prévue par le CDC.

### Règles de dépôt et d'absence
- RG-11 : ajout des délais de dépôt pour congé annuel (14 à 30 jours avant), mission (au moins 7 jours avant), maternité (1 à 3 mois avant la date prévue d'accouchement) et paternité (14 à 30 jours avant la date prévue).
- Ajout de `date_evenement_prevue` au modèle de demande, au sérialiseur et à la migration `0004_delais_et_activation_rh.py`.
- RG-14 : durée fixe de 90 jours calendaires pour la maternité et de 15 jours pour la paternité.
- RG-01 : plafonds de permission et d'autorisation maintenus à 3/15 et 5/30 jours ; seule l'absence annuelle utilise le solde annuel.
- Les justificatifs sont contrôlés par extension, taille maximale de 15 Mo, non-vacuité et signature du contenu (PDF/JPEG/PNG/TIFF).

### Circuit de validation
- RG-13 : une approbation favorable du Chef de service passe à `APPROUVE_CS` et débite immédiatement le quota annuel s'il s'agit d'un congé annuel.
- Le visa favorable du Directeur fait passer la demande à `VALIDE_DIR` sans second débit.
- Une demande déposée par un Chef de service suit la route directe au Directeur, qui est le valideur effectif de cette demande.
- Les avis de faveur (permission/autorisation) exigent une observation motivée.

### Notifications
- Ajout du service `conges/services/notifications.py` : lorsqu'un justificatif est joint à une mission, un repos sanitaire, une maternité ou une paternité, le service programme une notification à l'adresse du Chef du service et du Directeur de la direction après validation transactionnelle.
- L'échec d'un courriel est consigné dans les logs et ne fait pas perdre la demande. Les adresses des destinataires doivent être renseignées dans les fiches Personnel et le serveur mail configuré pour une livraison réelle.

### PDF officiels et OCR
- La génération du formulaire échoue avec une erreur métier explicite si les informations communes nécessaires (identité, corps, grade, affectation, dates, motif, lieu et durée) sont incomplètes.
- Pour un congé annuel, le PDF exige une année de titre, une décision RH valide couvrant cette année et un solde activé ; il remplit les champs budgétaires/décision disponibles dans le dossier RH.
- Le solde mobilisable n'est affiché que pour un congé annuel, afin de ne pas laisser croire qu'une permission ou une autre absence consomme le quota annuel.
- Le sérialiseur expose la date prévue de l'évènement familial et rend `est_valide` non modifiable directement par l'API ; la validation passe par l'action RH dédiée.

### Tests et environnement
- `python manage.py test ...` choisit par défaut `config.settings.test`, même si le shell est configuré avec les settings de développement, sauf si `--settings` est explicitement fourni.
- Les tests utilisent une base SQLite en mémoire et un cache local isolé ; les limites de débit sont désactivées dans cet environnement de test seulement. Les limites de débit en développement/production restent configurées.
- Les tests ont été mis à jour pour refléter l'absence de tranche obligatoire de 15 jours, les durées fixes, le débit dès l'approbation du Chef, le non-double-comptage d'une demande en cours, les délais réglementaires et le contenu exigé pour les PDF.
- `python -m compileall -q .` s'est terminé sans erreur. Cela vérifie la syntaxe, mais ne remplace pas l'exécution des tests Django.

## Migrations

La livraison inclut les migrations existantes du backend, dont :
- `0003_demandeabsence_annee_titre.py` pour l'année d'imputation des congés annuels ;
- `0004_delais_et_activation_rh.py` pour la date prévue de l'évènement familial et le défaut `est_valide=False`.

Avant d'utiliser cette archive sur une base existante, faire une sauvegarde puis lancer `python manage.py migrate` depuis le backend.

## Vérification locale à effectuer avant déploiement

Dans un environnement local où les dépendances de `requirements.txt` sont installées :

```powershell
python -m pip install -r requirements.txt
python manage.py check
python manage.py test conges personnels organisation
```

Il faut aussi configurer les paramètres SMTP pour que les notifications soient envoyées réellement. Le backend doit être évalué avec la base de données de test intégrée avant déploiement en production.

## Secrets

L'archive source contenait un fichier `.env`. Celui-ci n'est pas inclus dans cette livraison ; seul `.env.example` est fourni avec des valeurs d'exemple. Si des identifiants réels du `.env` d'origine ont été partagés ailleurs, les renouveler.
