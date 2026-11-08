# Règle des tranches de congé annuel

La règle est appliquée côté backend à chaque soumission, même lorsque l'API est appelée directement :

- Pour chaque agent et chaque année de titre, la première demande de congé annuel non rejetée doit durer exactement 15 jours calendaires.
- Chaque tranche suivante doit durer au plus 15 jours calendaires et doit rester dans le solde disponible.
- Une demande rejetée ne compte pas comme tranche : l'agent peut soumettre une nouvelle première tranche de 15 jours.
- Une demande en attente, visée, validée ou archivée compte comme une tranche déjà engagée.
- Le formulaire React interroge `GET /api/demandes/regle-tranche-annuelle/?annee_titre=2026` (ajoute `personnel=<id>` pour une saisie déléguée autorisée), annonce la règle et adapte les contraintes de dates.
- La règle côté frontend est informative et ergonomique ; le backend refait toujours la validation définitive.

Aucune migration de base n'est requise. Les demandes existantes ne sont pas automatiquement modifiées : les demandes anciennes ont été enregistrées avec les règles antérieures.
