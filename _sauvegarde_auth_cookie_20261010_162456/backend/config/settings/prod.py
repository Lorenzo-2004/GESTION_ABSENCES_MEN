"""Environnement de production : serveur intranet LAN du MEN (CDC §5.3).

Aucun réglage permissif ici : la configuration refuse de démarrer si elle est
incomplète ou si une valeur de développement a été oubliée.
"""

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403
from .base import SECRET_KEY, env, env_bool, env_liste

DEBUG = False

# --------------------------------------------------------------------------- #
#  Garde-fous de démarrage
# --------------------------------------------------------------------------- #
if SECRET_KEY in {"dev-only-insecure-key", "change-me"}:
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY doit être défini avec une valeur propre à la production."
    )

ALLOWED_HOSTS = env_liste("DJANGO_ALLOWED_HOSTS", "")
if not ALLOWED_HOSTS:
    raise ImproperlyConfigured(
        "DJANGO_ALLOWED_HOSTS doit lister les hôtes du serveur intranet (ex. : conges.men.local)."
    )

if env_bool("DJANGO_DEBUG", False):
    raise ImproperlyConfigured("DJANGO_DEBUG ne peut pas être activé en production.")

# La base de production est PostgreSQL : un DB_NAME oublié ferait silencieusement
# retomber Django sur SQLite (cf. config.settings.base). On refuse ce cas de figure.
if DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":  # noqa: F405
    raise ImproperlyConfigured(
        "DB_NAME doit être défini en production : la base doit être PostgreSQL, pas SQLite."
    )

# --------------------------------------------------------------------------- #
#  Partage de ressources (frontend React servi depuis un autre hôte autorisé)
# --------------------------------------------------------------------------- #
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = env_liste("DJANGO_CORS_ALLOWED_ORIGINS", "")
CORS_ALLOW_CREDENTIALS = False

# --------------------------------------------------------------------------- #
#  Durcissement HTTP (le LAN reste en HTTP interne : HSTS paramétrable)
# --------------------------------------------------------------------------- #
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = "DENY"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = env_bool("DJANGO_COOKIE_SECURE", False)
CSRF_COOKIE_SECURE = env_bool("DJANGO_COOKIE_SECURE", False)
SECURE_SSL_REDIRECT = env_bool("DJANGO_SSL_REDIRECT", False)
SECURE_HSTS_SECONDS = int(env("DJANGO_HSTS_SECONDS", "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_HSTS_SECONDS > 0
SECURE_HSTS_PRELOAD = False
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Les pièces justificatives médicales ne sont jamais servies par le serveur web :
# elles passent par une vue authentifiée (cf. conges.views.TelechargerJustificatif).
MEDIA_URL = "/media-prive/"

# --------------------------------------------------------------------------- #
#  Journalisation : les erreurs doivent être exploitables, pas silencieuses
# --------------------------------------------------------------------------- #
# RotatingFileHandler ne crée pas l'arborescence manquante : on la prépare ici,
# sinon le démarrage échoue avec « Unable to configure handler 'fichier' ».
DOSSIER_LOGS = BASE_DIR / "logs"  # noqa: F405
DOSSIER_LOGS.mkdir(parents=True, exist_ok=True)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {"format": "[{asctime}] {levelname} {name} : {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "standard"},
        "fichier": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": DOSSIER_LOGS / "men-conges.log",
            "maxBytes": 5 * 1024 * 1024,
            "backupCount": 5,
            "formatter": "standard",
            "encoding": "utf-8",
        },
    },
    "root": {"handlers": ["console", "fichier"], "level": "INFO"},
    "loggers": {
        "django.request": {"handlers": ["console", "fichier"], "level": "WARNING", "propagate": False},
        "conges": {"handlers": ["console", "fichier"], "level": "INFO", "propagate": False},
    },
}

# Le mode console pour les courriels ne doit pas subsister en production.
EMAIL_BACKEND = env("DJANGO_EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
