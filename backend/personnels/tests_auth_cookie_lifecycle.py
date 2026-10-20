"""Tests RED du cycle de vie des sessions JWT par cookies pour MEN.

Ces tests complètent tests_auth_cookies.py. Ils décrivent le contrat cible et
ne doivent être exécutés qu'avec DJANGO_SETTINGS_MODULE=config.settings.test.
Aucun code de production ne doit être modifié avant revue et exécution de ces tests.
"""

from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from organisation.models import Direction
from .models import Personnel, Role, Statut, Utilisateur


MOT_DE_PASSE = "Test-Password-123!"
URL_CSRF = "/api/auth/csrf/"
URL_SESSION_CONNEXION = "/api/auth/session/connexion/"
URL_SESSION_RAFRAICHIR = "/api/auth/session/rafraichir/"
URL_SESSION_DECONNEXION = "/api/auth/session/deconnexion/"
URL_MOI = "/api/auth/moi/"
URL_MOT_DE_PASSE = "/api/auth/mot-de-passe/"
URL_RAFRAICHIR_HISTORIQUE = "/api/auth/rafraichir/"

COOKIE_ACCESS = "men_access"
COOKIE_REFRESH = "men_refresh"


class CycleDeVieSessionCookieTests(TestCase):
    """Règles administrateur, authentification cookie, CSRF, refresh et logout."""

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.direction = Direction.objects.create(
            code_direction="AUTHLC",
            nom_direction="Direction test cycle cookie",
        )
        self.personnel = self._creer_personnel("IM-LC-0001", "CIN-LC-0001")
        self.agent = Utilisateur.objects.create_user(
            username="compte-cycle-agent",
            password=MOT_DE_PASSE,
            role=Role.AGENT,
            personnel=self.personnel,
        )

    def _creer_personnel(self, im, cin, nom="TEST", prenoms="Cycle"):
        return Personnel.objects.create(
            im=im,
            cin=cin,
            direction=self.direction,
            nom=nom,
            prenoms=prenoms,
            sexe="M",
            date_naissance=date(1990, 1, 1),
            statut=Statut.FONCTIONNAIRE,
        )

    
    def _csrf(self):
        response = self.client.get(URL_CSRF, HTTP_HOST="localhost")

        if response.status_code == 200:
            token = response.data.get("csrfToken", "")
            if token:
                return token

        return "csrf-bootstrap-not-implemented"


    def _connexion_session(self, identifiant, password=MOT_DE_PASSE, csrf=None):
        headers = {"HTTP_HOST": "localhost"}
        if csrf is not None:
            headers["HTTP_X_CSRFTOKEN"] = csrf
        return self.client.post(
            URL_SESSION_CONNEXION,
            {"identifiant": identifiant, "password": password},
            format="json",
            **headers,
        )

    def _installer_jetons_cookie(self, utilisateur=None, access=None, refresh=None):
        if utilisateur is not None:
            token = RefreshToken.for_user(utilisateur)
            access = str(token.access_token)
            refresh = str(token)
        if access is not None:
            self.client.cookies[COOKIE_ACCESS] = access
        if refresh is not None:
            self.client.cookies[COOKIE_REFRESH] = refresh
        return access, refresh

    def test_personnel_linked_admin_logs_in_with_im(self):
        personnel_admin = self._creer_personnel("IM-LC-ADMIN", "CIN-LC-ADMIN", "ADMIN")
        Utilisateur.objects.create_user(
            username="admin-lie-cycle",
            password=MOT_DE_PASSE,
            role=Role.ADMIN,
            personnel=personnel_admin,
        )
        csrf = self._csrf()

        response = self._connexion_session(personnel_admin.im, csrf=csrf)

        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertIn(COOKIE_ACCESS, response.cookies)
        self.assertIn(COOKIE_REFRESH, response.cookies)
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)

    def test_personnel_less_admin_can_log_in_with_username(self):
        admin = Utilisateur.objects.create_user(
            username="admin-sans-personnel",
            password=MOT_DE_PASSE,
            role=Role.ADMIN,
            personnel=None,
        )
        csrf = self._csrf()

        response = self._connexion_session(admin.username, csrf=csrf)

        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertIn(COOKIE_ACCESS, response.cookies)
        self.assertIn(COOKIE_REFRESH, response.cookies)
        admin.refresh_from_db()
        self.assertIsNone(admin.personnel_id)

    def test_ambiguous_im_and_admin_username_is_rejected(self):
        valeur_ambigue = "IM-LC-AMBIG"
        personnel = self._creer_personnel(valeur_ambigue, "CIN-LC-AMBIG")
        Utilisateur.objects.create_user(
            username="compte-ambig-agent",
            password=MOT_DE_PASSE,
            role=Role.AGENT,
            personnel=personnel,
        )
        Utilisateur.objects.create_user(
            username=valeur_ambigue,
            password=MOT_DE_PASSE,
            role=Role.ADMIN,
            personnel=None,
        )
        csrf = self._csrf()

        response = self._connexion_session(valeur_ambigue, csrf=csrf)

        self.assertEqual(response.status_code, 401, getattr(response, "data", None))
        self.assertNotIn(COOKIE_ACCESS, response.cookies)
        self.assertNotIn(COOKIE_REFRESH, response.cookies)

    def test_profile_accepts_valid_access_cookie(self):
        self._installer_jetons_cookie(utilisateur=self.agent)

        response = self.client.get(URL_MOI, HTTP_HOST="localhost")

        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertEqual(response.data["id"], self.agent.id)
        self.assertEqual(response.data["role"], Role.AGENT)
        self.assertEqual(response.data["personnel"]["im"], self.personnel.im)
        self.assertNotIn("password", response.data)
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)

    def test_expired_or_invalid_access_cookie_is_rejected_without_server_error(self):
        self.client.cookies[COOKIE_ACCESS] = "not-a-valid-jwt"

        response = self.client.get(URL_MOI, HTTP_HOST="localhost")

        self.assertEqual(response.status_code, 401, getattr(response, "data", None))
        self.assertLess(response.status_code, 500)

    def test_invalid_cookie_does_not_fall_back_to_valid_bearer_header(self):
        token = RefreshToken.for_user(self.agent)
        self.client.cookies[COOKIE_ACCESS] = "not-a-valid-jwt"

        response = self.client.get(
            URL_MOI,
            HTTP_AUTHORIZATION=f"Bearer {token.access_token}",
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 401, getattr(response, "data", None))

    def test_unsafe_cookie_authenticated_request_requires_csrf(self):
        self._installer_jetons_cookie(utilisateur=self.agent)
        response = self.client.post(
            URL_MOT_DE_PASSE,
            {
                "ancien_mot_de_passe": "ancien-mot-de-passe-incorrect",
                "nouveau_mot_de_passe": "Nouveau-MotDePasse-123!",
            },
            format="json",
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 403, getattr(response, "data", None))
        self.agent.refresh_from_db()
        self.assertTrue(self.agent.check_password(MOT_DE_PASSE))

    def test_unsafe_cookie_authenticated_request_with_csrf_reaches_validation(self):
        self._installer_jetons_cookie(utilisateur=self.agent)
        csrf = self._csrf()
        response = self.client.post(
            URL_MOT_DE_PASSE,
            {
                "ancien_mot_de_passe": "ancien-mot-de-passe-incorrect",
                "nouveau_mot_de_passe": "Nouveau-MotDePasse-123!",
            },
            format="json",
            HTTP_X_CSRFTOKEN=csrf,
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 400, getattr(response, "data", None))
        self.agent.refresh_from_db()
        self.assertTrue(self.agent.check_password(MOT_DE_PASSE))

    def test_session_refresh_requires_csrf(self):
        _, refresh = self._installer_jetons_cookie(utilisateur=self.agent)

        response = self.client.post(
            URL_SESSION_RAFRAICHIR,
            {},
            format="json",
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 403, getattr(response, "data", None))
        self.assertNotIn(COOKIE_ACCESS, response.cookies)
        self.assertNotIn(COOKIE_REFRESH, response.cookies)
        self.assertIsNotNone(refresh)

    def test_session_refresh_rotates_cookies_without_returning_jwts(self):
        _, old_refresh = self._installer_jetons_cookie(utilisateur=self.agent)
        csrf = self._csrf()

        response = self.client.post(
            URL_SESSION_RAFRAICHIR,
            {},
            format="json",
            HTTP_X_CSRFTOKEN=csrf,
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertIn(COOKIE_ACCESS, response.cookies)
        self.assertIn(COOKIE_REFRESH, response.cookies)
        self.assertNotEqual(response.cookies[COOKIE_REFRESH].value, old_refresh)
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)

    def test_rotated_refresh_token_is_blacklisted(self):
        _, old_refresh = self._installer_jetons_cookie(utilisateur=self.agent)
        csrf = self._csrf()

        renouvellement = self.client.post(
            URL_SESSION_RAFRAICHIR,
            {},
            format="json",
            HTTP_X_CSRFTOKEN=csrf,
            HTTP_HOST="localhost",
        )
        self.assertEqual(renouvellement.status_code, 200, getattr(renouvellement, "data", None))

        ancien_reutilise = self.client.post(
            URL_RAFRAICHIR_HISTORIQUE,
            {"refresh": old_refresh},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(ancien_reutilise.status_code, 401, getattr(ancien_reutilise, "data", None))

    def test_session_refresh_rejects_missing_refresh_cookie(self):
        csrf = self._csrf()

        response = self.client.post(
            URL_SESSION_RAFRAICHIR,
            {},
            format="json",
            HTTP_X_CSRFTOKEN=csrf,
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 401, getattr(response, "data", None))
        self.assertNotIn("access", getattr(response, "data", {}))
        self.assertNotIn("refresh", getattr(response, "data", {}))

    def test_session_logout_requires_csrf(self):
        self._installer_jetons_cookie(utilisateur=self.agent)

        response = self.client.post(
            URL_SESSION_DECONNEXION,
            {},
            format="json",
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 403, getattr(response, "data", None))
        self.assertNotIn(COOKIE_ACCESS, response.cookies)
        self.assertNotIn(COOKIE_REFRESH, response.cookies)

    def test_session_logout_blacklists_refresh_and_expires_cookies(self):
        _, old_refresh = self._installer_jetons_cookie(utilisateur=self.agent)
        csrf = self._csrf()

        response = self.client.post(
            URL_SESSION_DECONNEXION,
            {},
            format="json",
            HTTP_X_CSRFTOKEN=csrf,
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 205, getattr(response, "data", None))
        self.assertIn(COOKIE_ACCESS, response.cookies)
        self.assertIn(COOKIE_REFRESH, response.cookies)
        for name in (COOKIE_ACCESS, COOKIE_REFRESH):
            self.assertEqual(response.cookies[name].value, "")
            self.assertEqual(str(response.cookies[name]["max-age"]), "0")
            
        reuse = self.client.post(
            URL_RAFRAICHIR_HISTORIQUE,
            {"refresh": old_refresh},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(reuse.status_code, 401, getattr(reuse, "data", None))

    def test_session_login_with_invalid_csrf_is_rejected(self):
        self._csrf()

        response = self._connexion_session(
            self.personnel.im,
            csrf="csrf-invalide",
        )

        self.assertEqual(response.status_code, 403)
        self.assertNotIn(COOKIE_ACCESS, response.cookies)
        self.assertNotIn(COOKIE_REFRESH, response.cookies)

    def test_session_refresh_rejects_invalid_refresh_cookie(self):
        csrf = self._csrf()
        self.client.cookies[COOKIE_REFRESH] = "jwt-invalide"

        response = self.client.post(
            URL_SESSION_RAFRAICHIR,
            {},
            format="json",
            HTTP_X_CSRFTOKEN=csrf,
            HTTP_HOST="localhost",
        )

        self.assertEqual(
            response.status_code,
            401,
            getattr(response, "data", None),
        )
        self.assertNotIn("access", getattr(response, "data", {}))
        self.assertNotIn("refresh", getattr(response, "data", {}))