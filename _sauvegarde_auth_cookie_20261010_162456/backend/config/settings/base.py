"""Configuration commune à tous les environnements (CDC §5.1).

Les réglages sensibles à l'environnement (DEBUG, CORS, sécurité, hachage des mots
de passe de test) vivent dans dev.py, prod.py et test.py.
"""

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")


def env(nom, defaut=None):
    """Lit une variable d'environnement en la dépouillant des espaces parasites."""
    valeur = os.getenv(nom)
    return valeur.strip() if valeur and valeur.strip() else defaut


def env_bool(nom, defaut=False):
    return env(nom, str(defaut)).strip().lower() in {"1", "true", "yes", "on"}


def env_liste(nom, defaut=""):
    return [element.strip() for element in env(nom, defaut).split(",") if element.strip()]


# --------------------------------------------------------------------------- #
#  Sécurité de base
# --------------------------------------------------------------------------- #
SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-only-insecure-key")
DEBUG = env_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = env_liste("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_liste("DJANGO_CSRF_TRUSTED_ORIGINS", "")

# --------------------------------------------------------------------------- #
#  Applications
# --------------------------------------------------------------------------- #
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Tiers
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    # Domaine MEN
    "organisation",
    "personnels",
    "conges",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# --------------------------------------------------------------------------- #
#  Base de données : PostgreSQL si DB_NAME est défini, sinon SQLite (dev rapide)
# --------------------------------------------------------------------------- #
if env("DB_NAME"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("DB_NAME"),
            "USER": env("DB_USER", "postgres"),
            "PASSWORD": os.getenv("DB_PASSWORD", ""),
            "HOST": env("DB_HOST", "localhost"),
            "PORT": env("DB_PORT", "5432"),
            "CONN_MAX_AGE": int(env("DB_CONN_MAX_AGE", "60")),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# --------------------------------------------------------------------------- #
#  Authentification
# --------------------------------------------------------------------------- #
AUTH_USER_MODEL = "personnels.Utilisateur"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --------------------------------------------------------------------------- #
#  Internationalisation (contexte MEN Madagascar)
# --------------------------------------------------------------------------- #
LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Indian/Antananarivo"
USE_I18N = True
USE_TZ = True

# --------------------------------------------------------------------------- #
#  Fichiers statiques et médias
# --------------------------------------------------------------------------- #
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Les pièces justificatives sont bornées : 5 Mo (cf. conges.regles).
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

# --------------------------------------------------------------------------- #
#  API REST
# --------------------------------------------------------------------------- #
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "commun.pagination.PaginationStandard",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "EXCEPTION_HANDLER": "commun.exceptions.gestionnaire_exceptions",
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        "anon": "30/minute",
        "user": "600/minute",
        "connexion": "10/minute",
    },
    "DATETIME_FORMAT": "%Y-%m-%dT%H:%M:%S%z",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_AUTHENTICATION_RULE": "rest_framework_simplejwt.authentication.default_user_authentication_rule",
}

# En-tête accepté par le frontend pour l'isolation des données (RG-06)
APP_NAME = "Gestion des congés et absences — MEN"
