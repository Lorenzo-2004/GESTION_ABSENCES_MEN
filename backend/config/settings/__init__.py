"""Réglages du projet, découpés par environnement (CDC §5.3).

Ce paquet ne définit aucun réglage : il faut choisir explicitement l'environnement
via la variable DJANGO_SETTINGS_MODULE.

    config.settings.dev    développement local (DEBUG, CORS ouvert, API navigable)
    config.settings.test   exécution des tests (hachage rapide, débit illimité)
    config.settings.prod   serveur intranet du MEN (durci, refuse les défauts de dev)

Le module `base` contient les réglages communs aux trois.
"""
