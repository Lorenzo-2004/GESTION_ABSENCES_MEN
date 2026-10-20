"""Tests de contrat pour le futur flux de session MEN par cookies.

Ces tests décrivent le comportement cible avant l'implémentation.
Ils ne doivent jamais être exécutés contre une base de production.
"""

from datetime import date

from rest_framework.test import APIClient
from django.test import TestCase

from organisation.models import Direction

from .models import Personnel, Role, Statut, Utilisateur


URL_CSRF = "/api/auth/csrf/"
URL_SESSION_CONNEXION = "/api/auth/session/connexion/"
MOT_DE_PASSE = "Test-Password-123!"


class AuthentificationSessionCookieTests(TestCase):
    """Premier lot de tests RED pour le contrat d'authentification navigateur."""

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.direction = Direction.objects.create(
            code_direction="AUTH01",
            nom_direction="Direction de test authentification",
        )
        self.personnel = Personnel.objects.create(
            im="IM-AUTH-0001",
            cin="CIN-AUTH-0001",
            direction=self.direction,
            nom="TEST",
            prenoms="Agent",
            sexe="M",
            date_naissance=date(1990, 1, 1),
            statut=Statut.FONCTIONNAIRE,
        )
        # Le username est volontairement différent de l'IM : c'est le cas
        # réel confirmé par l'audit (0/3 comptes utilisaient leur IM en username).
        self.utilisateur = Utilisateur.objects.create_user(
            username="compte-agent-auth-test",
            password=MOT_DE_PASSE,
            role=Role.AGENT,
            personnel=self.personnel,
        )

    def _obtenir_jeton_csrf(self):
        """Récupère le jeton quand l'endpoint cible existe.

        Le test de bootstrap vérifie séparément le statut HTTP et le format.
        Le texte de repli permet au test de connexion d'échouer sur le contrat
        manquant sans masquer ce premier échec par une assertion helper.
        """
        response = self.client.get(URL_CSRF, HTTP_HOST="localhost")
        if response.status_code == 200:
            return response.data.get("csrfToken", "")
        return "csrf-bootstrap-not-implemented"

    def _poster_connexion(self, identifiant, password, csrf_token=None):
        entetes = {"HTTP_HOST": "localhost"}
        if csrf_token is not None:
            entetes["HTTP_X_CSRFTOKEN"] = csrf_token
        return self.client.post(
            URL_SESSION_CONNEXION,
            {"identifiant": identifiant, "password": password},
            format="json",
            **entetes,
        )

    def test_csrf_bootstrap_returns_token_and_sets_cookie(self):
        response = self.client.get(URL_CSRF, HTTP_HOST="localhost")

        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertTrue(response.data.get("csrfToken"))
        self.assertIn("csrftoken", response.cookies)
        self.assertNotIn("men_access", response.cookies)
        self.assertNotIn("men_refresh", response.cookies)

    def test_session_login_without_csrf_is_rejected(self):
        response = self._poster_connexion(
            identifiant=self.personnel.im,
            password=MOT_DE_PASSE,
        )

        self.assertEqual(response.status_code, 403, getattr(response, "data", None))
        self.assertNotIn("men_access", response.cookies)
        self.assertNotIn("men_refresh", response.cookies)

    def test_session_login_by_im_succeeds_when_username_differs(self):
        csrf_token = self._obtenir_jeton_csrf()
        response = self._poster_connexion(
            identifiant=self.personnel.im,
            password=MOT_DE_PASSE,
            csrf_token=csrf_token,
        )

        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertIn("men_access", response.cookies)
        self.assertIn("men_refresh", response.cookies)
        self.assertTrue(response.cookies["men_access"].get("httponly"))
        self.assertTrue(response.cookies["men_refresh"].get("httponly"))
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertEqual(self.utilisateur.username, "compte-agent-auth-test")

    def test_invalid_im_and_wrong_password_return_same_generic_error(self):
        csrf_token = self._obtenir_jeton_csrf()
        mauvais_mot_de_passe = self._poster_connexion(
            identifiant=self.personnel.im,
            password="MotDePasse-Incorrect!",
            csrf_token=csrf_token,
        )
        im_inconnu = self._poster_connexion(
            identifiant="IM-INCONNU-9999",
            password=MOT_DE_PASSE,
            csrf_token=csrf_token,
        )

        self.assertEqual(mauvais_mot_de_passe.status_code, 401)
        self.assertEqual(im_inconnu.status_code, 401)
        self.assertEqual(
            mauvais_mot_de_passe.data.get("detail"),
            im_inconnu.data.get("detail"),
        )
        for response in (mauvais_mot_de_passe, im_inconnu):
            self.assertNotIn("men_access", response.cookies)
            self.assertNotIn("men_refresh", response.cookies)
            self.assertNotIn("access", response.data)
            self.assertNotIn("refresh", response.data)

    def test_non_admin_cannot_use_username_as_session_identifier(self):
        csrf_token = self._obtenir_jeton_csrf()
        response = self._poster_connexion(
            identifiant=self.utilisateur.username,
            password=MOT_DE_PASSE,
            csrf_token=csrf_token,
        )

        self.assertEqual(response.status_code, 401, getattr(response, "data", None))
        self.assertNotIn("men_access", response.cookies)
        self.assertNotIn("men_refresh", response.cookies)
