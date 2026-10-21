MISE À JOUR CIBLÉE — VÉRIFICATION D’INTÉGRITÉ DES PDF

Cette archive ne remplace que les fichiers nécessaires à l’endpoint GET /api/demandes/<id>/integrite/ et au scellement du PDF. Elle ne contient ni .env, ni base de données, ni settings, ni medias.

Avant d’extraire : sauvegarder les fichiers existants sous conges/.

Depuis le dossier backend qui contient manage.py :
1. Extraire cette archive dans ce dossier et accepter le remplacement des fichiers.
2. Vérifier : python manage.py check
3. Vérifier la migration : python manage.py showmigrations conges
4. Appliquer : python manage.py migrate
5. Vérifier les migrations : python manage.py makemigrations --check --dry-run
6. Redémarrer le serveur Django.

La migration 0006 dépend de 0005_signature_demande_avant_soumission. Ne supprimez aucune migration existante.
Le endpoint est généré par le routeur sur DemandeAbsenceViewSet ; ne pas ajouter une URL manuelle en double.
