# Correctif du journal de signature — demande préexistante n° 19

Ce correctif résout le cas où une demande existante possède une signature valide mais aucun événement d'audit initial. Il ajoute aussi la trace de signature au moment de la soumission pour les nouvelles demandes.

## Fichiers fournis

- `conges/models.py` : ajoute l'événement explicite `SIGNATURE_AGENT_RECONCILIEE`.
- `conges/views.py` : lors des nouvelles soumissions, enregistre une trace `SIGNATURE_AGENT_ENREGISTREE` avant toute génération PDF.
- `conges/services/signatures.py` : accepte la trace de réconciliation explicite tout en vérifiant le chaînage et l'ancre.
- `conges/migrations/0007_tracesignature_signature_agent_reconciliee.py` : met à jour les choix d'événements.
- `reconcilier_signature_demande_19.py` : initialise le journal pour la demande 19 uniquement si la signature est vérifiée et si aucun journal/PDF/ancre n'existe.

## Installation (PowerShell, depuis le dossier backend contenant manage.py)

1. Sauvegardez `conges\models.py`, `conges\views.py` et `conges\services\signatures.py`.
2. Extrayez cette archive dans le dossier backend et acceptez le remplacement des trois fichiers concernés. Ne supprimez pas les migrations `0001` à `0006`.
3. Exécutez :

```powershell
python manage.py check
python manage.py migrate
python manage.py makemigrations --check --dry-run
```

4. Si ces commandes réussissent, lancez une fois le script de réconciliation :

```powershell
python manage.py shell -c "exec(open('reconcilier_signature_demande_19.py', encoding='utf-8-sig').read())"
```

Le script ne crée pas le PDF et n'invente pas une date d'événement historique : il journalise la réconciliation à la date réelle et conserve la date de signature initialement enregistrée dans les détails. Il s'arrête sans écrire si la signature ne correspond pas, ou si des traces/PDF/ancre existent déjà.

5. Redémarrez Django, reconnectez-vous au frontend, puis essayez de télécharger le formulaire de la demande 19. Vérifiez ensuite `GET /api/demandes/19/integrite/`.

Si une étape renvoie une erreur, arrêtez-vous et examinez la sortie avant de continuer.
