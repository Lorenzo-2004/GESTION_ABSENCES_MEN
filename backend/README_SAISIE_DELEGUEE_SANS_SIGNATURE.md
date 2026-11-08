# MEN — Saisie d'une demande par le chef pour un agent

## Comportement

- Dans l'espace Chef de service, le chef sélectionne un agent de son service puis remplit le formulaire comme pour une demande normale.
- Pour cette saisie déléguée, la signature électronique de l'agent n'est pas requise et le formulaire n'affiche pas de zone de signature.
- L'API n'accepte ce contournement que si le compte authentifié est `ROLE_CHEF_SERVICE`, si un autre personnel est ciblé, et si le personnel appartient au même service et à la même direction.
- Une demande personnelle garde l'obligation de signature. Le compte RH conserve également cette obligation lorsqu'il saisit une demande pour un agent.
- Le backend écrit une trace `DEMANDE_SAISIE_DELEGUEE` avec l'identité du chef et l'identifiant de l'agent cible. Le PDF officiel peut ensuite être généré sans signature de l'agent, tout en conservant la chaîne de traçabilité.

## Installation

Extraire ce correctif dans la racine du projet (`C:\Users\LORENZO\PROJECT_MEN`) en fusionnant les dossiers.

```powershell
cd C:\Users\LORENZO\PROJECT_MEN\backend
python manage.py migrate
python manage.py check
python manage.py test conges.tests_api --settings=config.settings.test
```

La migration `0009_tracesignature_saisie_deleguee` ne crée pas de table : elle met à jour les choix de l'événement de journal pour refléter le nouvel événement.
