"""Tests RED des permissions, attributs de cookies et CORS pour MEN.

À copier dans backend/personnels/tests_auth_cookie_security.py.
À exécuter uniquement avec DJANGO_SETTINGS_MODULE=config.settings.test.
Ces tests spécifient le comportement cible avant toute modification du code
applicatif. Ils ne doivent jamais être exécutés contre la base de production.
"""
import os
from unittest.mock import patch
from datetime import date
from importlib import import_module

from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from organisation.models import Direction
from .models import Personnel, Role, Statut, Utilisateur


MOT_DE_PASSE = "Test-Password-123!"
URL_CSRF = "/api/auth/csrf/"
URL_SESSION_CONNEXION = "/api/auth/session/connexion/"
URL_MOI = "/api/auth/moi/"
URL_DECISIONS = "/api/decisions/"
COOKIE_ACCESS = "men_access"
COOKIE_REFRESH = "men_refresh"
ORIGINE_FRONTEND = "http://127.0.0.1:5173"


class PermissionsEtAttributsCookiesTests(TestCase):
    """Vérifie les permissions métier et les attributs des cookies JWT."""

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.direction = Direction.objects.create(
            code_direction="AUTHSEC",
            nom_direction="Direction test sécurité cookies",
        )
        self.personnel_agent = self._creer_personnel("IM-SEC-AGENT", "CIN-SEC-AGENT")
        self.personnel_rh = self._creer_personnel("IM-SEC-RH", "CIN-SEC-RH", nom="RH")
        self.agent = Utilisateur.objects.create_user(
            username="compte-securite-agent",
            password=MOT_DE_PASSE,
            role=Role.AGENT,
            personnel=self.personnel_agent,
        )
        self.rh = Utilisateur.objects.create_user(
            username="compte-securite-rh",
            password=MOT_DE_PASSE,
            role=Role.RH,
            personnel=self.personnel_rh,
        )

    def _creer_personnel(self, im, cin, nom="TEST"):
        return Personnel.objects.create(
            im=im,
            cin=cin,
            direction=self.direction,
            nom=nom,
            prenoms="Sécurité",
            sexe="M",
            date_naissance=date(1990, 1, 1),
            statut=Statut.FONCTIONNAIRE,
        )

    def _installer_cookie_access(self, utilisateur):
        refresh = RefreshToken.for_user(utilisateur)
        self.client.cookies[COOKIE_ACCESS] = str(refresh.access_token)

    def _csrf(self):
        response = self.client.get(URL_CSRF, HTTP_HOST="localhost")
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        token = response.data.get("csrfToken")
        self.assertTrue(token)
        return token

    def test_agent_authenticated_by_cookie_cannot_list_rh_decisions(self):
        self._installer_cookie_access(self.agent)

        response = self.client.get(URL_DECISIONS, HTTP_HOST="localhost")

        self.assertEqual(response.status_code, 403, getattr(response, "data", None))

    def test_rh_authenticated_by_cookie_can_list_decisions(self):
        self._installer_cookie_access(self.rh)

        response = self.client.get(URL_DECISIONS, HTTP_HOST="localhost")

        self.assertEqual(response.status_code, 200, getattr(response, "data", None))

    @override_settings(MEN_AUTH_COOKIE_SECURE=True, MEN_AUTH_COOKIE_SAMESITE="Lax")
    def test_login_cookies_have_secure_flags_expected_paths_and_bounded_lifetimes(self):
        csrf = self._csrf()
        response = self.client.post(
            URL_SESSION_CONNEXION,
            {"identifiant": self.personnel_agent.im, "password": MOT_DE_PASSE},
            format="json",
            HTTP_X_CSRFTOKEN=csrf,
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertIn(COOKIE_ACCESS, response.cookies)
        self.assertIn(COOKIE_REFRESH, response.cookies)
        access_cookie = response.cookies[COOKIE_ACCESS]
        refresh_cookie = response.cookies[COOKIE_REFRESH]

        for cookie in (access_cookie, refresh_cookie):
            self.assertTrue(cookie["httponly"])
            self.assertTrue(cookie["secure"])
            self.assertEqual(cookie["samesite"], "Lax")

        self.assertEqual(access_cookie["path"], "/api/")
        self.assertEqual(refresh_cookie["path"], "/api/auth/session/")
        self.assertGreater(int(access_cookie["max-age"]), 0)
        self.assertGreater(int(refresh_cookie["max-age"]), 0)
        self.assertLessEqual(int(access_cookie["max-age"]), 60 * 60)
        self.assertLessEqual(int(refresh_cookie["max-age"]), 24 * 60 * 60)
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertNotIn(access_cookie.value, str(response.data))
        self.assertNotIn(refresh_cookie.value, str(response.data))


@override_settings(
    CORS_ALLOW_ALL_ORIGINS=False,
    CORS_ALLOWED_ORIGINS=[ORIGINE_FRONTEND],
    CORS_ALLOW_CREDENTIALS=True,
)
class CorsCookiesTests(TestCase):
    """Le navigateur doit autoriser uniquement l'origine frontend configurée."""

    def test_configured_frontend_origin_allows_credentials(self):
        response = self.client.get(
            URL_MOI,
            HTTP_HOST="localhost",
            HTTP_ORIGIN=ORIGINE_FRONTEND,
        )

        self.assertEqual(response.get("Access-Control-Allow-Origin"), ORIGINE_FRONTEND)
        self.assertEqual(response.get("Access-Control-Allow-Credentials"), "true")

    def test_unlisted_origin_is_not_allowed(self):
        response = self.client.get(
            URL_MOI,
            HTTP_HOST="localhost",
            HTTP_ORIGIN="https://origine-inconnue.example",
        )

        self.assertIsNone(response.get("Access-Control-Allow-Origin"))
        self.assertIsNone(response.get("Access-Control-Allow-Credentials"))


class ConfigurationProductionCookiesTests(SimpleTestCase):
    """La configuration prod doit imposer CORS explicite et cookies sécurisés."""

    def test_production_requires_explicit_origins_credentialed_cors_and_secure_cookies(self):
        variables_test = {
            "DJANGO_DEBUG": "0",
            "DJANGO_CORS_ALLOWED_ORIGINS": ORIGINE_FRONTEND,
            "DJANGO_COOKIE_SECURE": "1",
        }

        # Isoler les variables d'environnement et éviter la création
        # du dossier logs pendant l'import de la configuration de production.
        with patch.dict(os.environ, variables_test):
            with patch("pathlib.Path.mkdir"):
                production = import_module("config.settings.prod")

        self.assertFalse(production.CORS_ALLOW_ALL_ORIGINS)
        self.assertTrue(production.CORS_ALLOW_CREDENTIALS)
        self.assertTrue(production.SESSION_COOKIE_SECURE)
        self.assertTrue(production.CSRF_COOKIE_SECURE)
        self.assertTrue(
            getattr(production, "MEN_AUTH_COOKIE_SECURE", False)
        )
        self.assertIsInstance(
            production.CORS_ALLOWED_ORIGINS, (list, tuple)
        )
        self.assertGreater(len(production.CORS_ALLOWED_ORIGINS), 0)