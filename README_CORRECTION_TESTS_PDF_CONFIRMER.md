# Correction des 3 échecs de tests API PDF / activation

Cette mise à jour conserve le code métier du backend (dont la règle de tranche de congé annuel, l'OCR corrigé, le contrôle d'imputation avant activation et la migration `0008_alter_decisionconge_indice_code`). Elle met à jour les tests API qui n'étaient plus alignés avec le comportement actuel.

## 1. PDF officiel et XObjects

Le PDF final contient désormais le scan original du formulaire (image 997x1337) et, si l'agent a signé lors de la soumission, l'image de la signature (par exemple 720x180). L'ordre des XObjects n'est pas stable après `pypdf.merge_page()`. Les tests vérifient maintenant l'unicité de l'image de fond officielle par dimensions, sans supposer qu'elle est le premier XObject ni ignorer l'image de signature.

Le test de soulignement continue à vérifier qu'un seul trait est ajouté au libellé du type d'absence.

## 2. Activation / confirmer

L'activation impose désormais un numéro de décision, un budget et une imputation budgétaire non vides. Le test positif `confirmer` fournit donc l'imputation attendue. Un test négatif vérifie qu'une décision sans imputation ne peut pas être activée et ne génère pas de solde.

## 3. Vérification locale

Dans le backend Windows :

```powershell
python manage.py test conges.tests_api --settings=config.settings.test
python manage.py test conges.tests --settings=config.settings.test
```

Aucune migration supplémentaire n'est requise pour ces changements de tests. L'archive contient une seule migration `conges/migrations/0008_alter_decisionconge_indice_code.py` ; ne lancez pas `makemigrations --merge`.
