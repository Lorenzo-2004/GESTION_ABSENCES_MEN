"""Tests de caractérisation du contrat JWT historique MEN.

Ces tests verrouillent le comportement Bearer existant avant l'ajout du
nouveau flux navigateur par cookies. Ils utilisent uniquement la base de test
Django et des comptes créés dans chaque test.
"""

from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from organisation.models import Direction
from .models import Personnel, Role, Statut, Utilisateur


MOT_DE_PASSE = "Test-Password-123!"
URL_CONNEXION = "/api/auth/connexion/"
URL_RAFRAICHIR = "/api/auth/rafraichir/"
URL_DECONNEXION = "/api/auth/deconnexion/"
URL_MOI = "/api/auth/moi/"


class ContratJWTBearerHistoriqueTests(TestCase):
    """Garantit la compatibilité des clients qui utilisent Authorization: Bearer."""

    def setUp(self):
        self.client = APIClient()
        self.direction = Direction.objects.create(
            code_direction="AUTHBR",
            nom_direction="Direction test compatibilité Bearer",
        )
        self.personnel = Personnel.objects.create(
            im="IM-BEARER-0001",
            cin="CIN-BEARER-0001",
            direction=self.direction,
            nom="TEST",
            prenoms="Bearer",
            sexe="M",
            date_naissance=date(1990, 1, 1),
            statut=Statut.FONCTIONNAIRE,
        )
        self.utilisateur = Utilisateur.objects.create_user(
            username="compte-bearer-historique",
            password=MOT_DE_PASSE,
            role=Role.AGENT,
            personnel=self.personnel,
        )

    def _connecter_par_username(self):
        response = self.client.post(
            URL_CONNEXION,
            {"username": self.utilisateur.username, "password": MOT_DE_PASSE},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        return response.data

    def test_legacy_login_keeps_username_access_refresh_and_user_profile(self):
        donnees = self._connecter_par_username()

        self.assertTrue(donnees.get("access"))
        self.assertTrue(donnees.get("refresh"))
        self.assertIn("utilisateur", donnees)
        self.assertEqual(donnees["utilisateur"]["username"], self.utilisateur.username)
        self.assertEqual(donnees["utilisateur"]["role"], Role.AGENT)
        self.assertEqual(
            donnees["utilisateur"]["personnel"]["im"],
            self.personnel.im,
        )

    def test_legacy_profile_accepts_bearer_access_token(self):
        donnees = self._connecter_par_username()
        response = self.client.get(
            URL_MOI,
            HTTP_AUTHORIZATION=f"Bearer {donnees['access']}",
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertEqual(response.data["id"], self.utilisateur.id)
        self.assertEqual(response.data["username"], self.utilisateur.username)
        self.assertEqual(response.data["role"], Role.AGENT)
        self.assertEqual(response.data["personnel"]["im"], self.personnel.im)
        self.assertNotIn("password", response.data)
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)

    def test_legacy_refresh_keeps_json_contract_and_rotates_refresh_token(self):
        donnees_connexion = self._connecter_par_username()
        ancien_refresh = donnees_connexion["refresh"]

        response = self.client.post(
            URL_RAFRAICHIR,
            {"refresh": ancien_refresh},
            format="json",
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        self.assertTrue(response.data.get("access"))
        self.assertTrue(response.data.get("refresh"))
        self.assertNotEqual(response.data["refresh"], ancien_refresh)

        reuse = self.client.post(
            URL_RAFRAICHIR,
            {"refresh": ancien_refresh},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(reuse.status_code, 401, getattr(reuse, "data", None))

    def test_legacy_logout_keeps_refresh_body_contract_and_blacklists_token(self):
        donnees_connexion = self._connecter_par_username()
        ancien_refresh = donnees_connexion["refresh"]

        response = self.client.post(
           URL_DECONNEXION,
           {"refresh": ancien_refresh},
           format="json",
           HTTP_AUTHORIZATION=f"Bearer {donnees_connexion['access']}",
           HTTP_HOST="localhost",
)

        self.assertEqual(response.status_code, 205, getattr(response, "data", None))
        reuse = self.client.post(
            URL_RAFRAICHIR,
            {"refresh": ancien_refresh},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(reuse.status_code, 401, getattr(reuse, "data", None))
