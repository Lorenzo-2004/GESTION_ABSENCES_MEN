"""Environnement de test : rapide et sans effet de bord (CDC §6 phase 5).

Le hachage PBKDF2 coûte ~1 s par mot de passe sur ce poste : la suite de tests
crée plus de cent comptes, ce qui dominait le temps d'exécution. MD5PasswordHasher
est le réglage recommandé par Django pour les tests, jamais pour la production.
"""

from .base import *  # noqa: F401,F403
from pathlib import Path

DEBUG = False

# Base de tests isolée : ne jamais hériter d'un DB_NAME fourni dans le .env local.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "men-tests-isolated-cache",
    }
}
MEN_APPLIQUER_DELAIS_REGLEMENTAIRES = False

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Les limites de débit utilisent le cache partagé : elles rendraient les tests
# dépendants de leur ordre d'exécution.
REST_FRAMEWORK = {  # noqa: F405
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_THROTTLE_CLASSES": (),
    # Une limite à None désactive aussi les limites déclarées par une vue (ex. : connexion).
    "DEFAULT_THROTTLE_RATES": {"anon": None, "user": None, "connexion": None},
}

# Les médias de test ne doivent pas polluer le dossier media/ du projet.
MEDIA_ROOT = BASE_DIR / "media-tests"  # noqa: F405

# Les courriels de test restent en mémoire.
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
