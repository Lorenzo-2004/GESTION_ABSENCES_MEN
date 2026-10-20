"""Environnement de développement local (poste de travail, LAN MEN)."""

from .base import *  # noqa: F401,F403
from .base import env_bool, env_liste

DEBUG = env_bool("DJANGO_DEBUG", True)

ALLOWED_HOSTS = env_liste("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1") or ["*"]

# Le frontend Vite tourne sur un autre port que l'API en développement.
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# L'API navigable de DRF est pratique en développement uniquement.
REST_FRAMEWORK = {  # noqa: F405
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_RENDERER_CLASSES": (
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ),
}

# Les courriels de démonstration ne doivent pas partir : on les affiche en console.
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
