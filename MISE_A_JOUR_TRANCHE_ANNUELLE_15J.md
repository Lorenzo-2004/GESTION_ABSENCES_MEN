# Mise à jour — règles des tranches de congé annuel

- Première tranche de chaque année de titre : exactement 15 jours calendaires.
- Toutes les tranches suivantes : de 1 à 15 jours calendaires maximum, selon le solde disponible.
- Les rejets ne comptent pas comme une tranche consommée.
- Contrôle backend obligatoire à chaque soumission : un appel API direct ne peut pas contourner la règle.
- Nouvelle lecture API : `GET /api/demandes/regle-tranche-annuelle/?annee_titre=2026`, avec `personnel=<id>` uniquement pour une cible déléguée autorisée.
- Les demandes historiques déjà enregistrées ne sont pas modifiées automatiquement. Si une ancienne première tranche ne faisait pas 15 jours, le backend la signale comme incohérence et bloque les nouvelles demandes sur cette année jusqu'à régularisation RH. Cela évite qu'une ancienne donnée de test contourne la règle.
- Aucune migration de base de données n'est requise.

## Vérifications locales recommandées

```powershell
python manage.py check
python manage.py test conges.tests.SoumissionTests --settings=config.settings.test
python manage.py test conges.tests_api.DemandeAPITests --settings=config.settings.test
```
