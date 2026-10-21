# Renforcement de la signature électronique interne

## Ce qui est enregistré

- À la soumission, la signature PNG est associée au compte authentifié, à l'heure de signature et à son empreinte SHA-256.
- À la première génération du formulaire officiel, le backend conserve une copie figée du PDF après insertion de la signature, son empreinte SHA-256, la date de scellement et le compte qui l'a généré.
- Les téléchargements ultérieurs servent les mêmes octets du PDF conservé. Le backend vérifie le PDF, l'image de signature et le journal avant de servir le fichier.
- Le journal conserve la signature, le scellement du PDF et les téléchargements. Chaque entrée référence l'empreinte de la précédente ; une ancre est conservée sur la demande pour détecter aussi la suppression de la dernière entrée.
- L'API de vérification est `GET /api/demandes/<id_demande>/integrite/`. Elle suit les mêmes droits d'accès que la demande.
- Les traces sont en lecture seule dans l'admin et les opérations de mise à jour/suppression sont bloquées au niveau du modèle et du gestionnaire Django.

## Migration

La migration `0006_integrite_document_et_trace_signature` crée les champs de scellement et la table `traces_signature`.

Dans le répertoire contenant `manage.py` :

```powershell
python manage.py migrate
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test conges.tests_api.FormulairePdfRemplissageTests --keepdb
```

## Limite de sécurité à retenir

Il s'agit d'une trace interne avec détection d'altérations, pas d'une signature certifiée basée sur un certificat délivré par un prestataire de confiance. Un administrateur contrôlant directement la base de données et le stockage de fichiers pourrait altérer les deux côtés de l'ancre. Pour une garantie supérieure, conserver les empreintes dans un journal externe append-only ou un service de confiance, et intégrer une signature cryptographique de PDF de type PAdES avec certificat.
