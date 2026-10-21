# Backend MEN — version consolidée avec signature et vérification d'intégrité

Cette archive contient le dossier `backend/` complet, y compris les migrations jusqu'à
`0007_tracesignature_signature_agent_reconciliee.py`. Elle ne contient pas le fichier `.env`
local, la base de données PostgreSQL ni les fichiers médias/dépôts de signature existants.

## Installation sous Windows

1. Sauvegarder le dossier `conges/` et le fichier `.env`.
2. Extraire l'archive dans `C:\Users\LORENZO\PROJECT_MEN` en fusionnant les fichiers du dossier `backend/` avec le backend existant. Ne supprimer aucun fichier local qui n'est pas dans l'archive et ne pas supprimer les migrations.
3. Depuis `C:\Users\LORENZO\PROJECT_MEN\backend`, exécuter :

```powershell
python manage.py check
python manage.py showmigrations conges
python manage.py migrate
python manage.py makemigrations --check --dry-run
```

4. Pour les nouvelles demandes, la trace de signature est créée pendant la soumission. Pour la demande historique n°19, si elle a toujours une signature valide mais aucune trace/PDF/ancre, exécuter une seule fois :

```powershell
python manage.py shell -c "exec(open('reconcilier_signature_demande_19.py', encoding='utf-8-sig').read())"
```

Le script de réconciliation ne crée pas le PDF et ne falsifie pas la date de signature initiale. Il conserve cette date dans les détails, tout en enregistrant l'heure réelle de la réconciliation. Il refuse d'écrire si la signature est absente/invalide ou si un PDF, une trace ou une ancre existent déjà.

5. Redémarrer Django. Vérifier la route avec :

```powershell
python manage.py shell -c "from django.urls import resolve; print(resolve('/api/demandes/19/integrite/'))"
```

## Important

- Ne partagez pas le `.env` et ne remplacez pas sa valeur locale.
- Ne réinitialisez pas la base de données.
- La migration `0007` dépend de `0006_integrite_document_et_trace_signature`, elle-même dépendante de `0005_signature_demande_avant_soumission`.
- L'intégrité applicative ne remplace pas une signature certifiée basée sur un certificat ni un journal externalisé append-only.
