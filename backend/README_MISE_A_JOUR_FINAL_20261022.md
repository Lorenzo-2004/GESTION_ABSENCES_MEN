# Mise à jour backend MEN — 22 octobre 2026

Ce paquet combine la dernière base backend disponible, la correction du PDF HTTP 400 et la correction de `throttle_scope` au chargement des routes Django REST Framework.

## Points intégrés

- Sessions et rate limiting : access token 15 minutes, durée absolue de session 8 heures, limites connexion/API/OCR décrites dans `README_SESSION_LIMITS_RATE_LIMITING.md`.
- Correction PDF officiel : une décision activée doit comporter numéro, budget et imputation budgétaire.
- Script `corriger_pdf_400_dsi.py` : contrôle et réparation optionnelle de l'imputation budgétaire des décisions locales DSI `001/DSI/2026`, `002/DSI/2026`, `003/DSI/2026`. Il est en aperçu par défaut.
- Migration `0008_alter_decisionconge_indice.py` : le champ `DecisionConge.indice` devient une chaîne de caractères, afin de conserver les indices alphanumériques tels que `231 T`.
- `DecisionCongeViewSet.throttle_scope = "user"` : corrige le `TypeError` au chargement des routes, tout en gardant le scope OCR `ocr_scan` sur l'action de scan.
- Fixtures/tests mis à jour pour les champs budgétaires obligatoires et test négatif d'activation sans imputation.

## Mise à jour

1. Faire une copie du dossier backend et conserver votre `.env`. Ne remplacez pas votre fichier `.env` par `.env.example`.
2. Fusionner le contenu de `backend/` avec le dossier backend local. Sauvegarder vos modifications locales avant de remplacer des fichiers.
3. Dans PowerShell à la racine du backend, exécuter :

```powershell
python manage.py migrate
python manage.py check
python manage.py makemigrations --check --dry-run
```

La migration 0008 est requise pour l'indice alphanumérique. La mise à jour du scope ne requiert pas de migration.

## Réparer les décisions DSI déjà actives

Copier `corriger_pdf_400_dsi.py` à côté de `manage.py`, puis lancer d'abord en aperçu :

```powershell
python manage.py shell -c "exec(open('corriger_pdf_400_dsi.py', encoding='utf-8-sig').read())"
```

Si l'aperçu confirme que l'imputation des décisions locales de démonstration est vide et que la valeur locale `TEST DSI 2026` est appropriée, appliquer explicitement :

```powershell
$env:MEN_REPARER_PDF_400_DSI = "1"
python manage.py shell -c "exec(open('corriger_pdf_400_dsi.py', encoding='utf-8-sig').read())"
Remove-Item Env:MEN_REPARER_PDF_400_DSI
```

Cette imputation est réservée aux tests locaux. Remplacez-la par une valeur validée par la RH avant tout usage officiel. Le script ne stocke pas le PDF.

## Tests

```powershell
python manage.py test conges.tests.SoldeEtDecisionTests --settings=config.settings.test
python manage.py test personnels.tests_session_rate_limits --settings=config.settings.test
```

Dans cet environnement de création, Django n'est pas installé ; les tests applicatifs doivent donc être exécutés dans votre environnement virtuel local.
