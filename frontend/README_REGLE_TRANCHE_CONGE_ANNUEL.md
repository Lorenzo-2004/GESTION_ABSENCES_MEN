# Formulaire de congé annuel — règle des tranches

- Le formulaire appelle `GET /api/demandes/regle-tranche-annuelle/` pour déterminer si c'est la première tranche de l'agent au titre de l'année sélectionnée.
- Première tranche : exactement 15 jours calendaires ; la date de fin est proposée à J+14 après le choix du début.
- Tranches suivantes : 1 à 15 jours calendaires maximum, sous réserve du solde disponible.
- Le formulaire affiche un état de vérification, les contraintes de dates et un message bloquant si des demandes antérieures de l'année ne respectent pas la règle.
- La vérification finale reste faite par le backend lors de la soumission.
