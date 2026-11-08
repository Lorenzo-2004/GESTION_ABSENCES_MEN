"""Tests de durée absolue des sessions et de limitation des connexions MEN."""

from datetime import date, timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.tokens import RefreshToken

from organisation.models import Direction
from .enums import Role, Statut
from .models import Personnel, Utilisateur
from .serializers import ConnexionSerializer, SessionLimiteeTokenRefreshSerializer
from .throttling import ConnexionParHeureThrottle, ConnexionParMinuteThrottle


class LimitesSessionEtConnexionTests(TestCase):
    def setUp(self):
        self.direction = Direction.objects.create(
            code_direction="SECSESSION",
            nom_direction="Direction de test des sessions",
        )
        personnel = Personnel.objects.create(
            im="IM-SESSION-01",
            cin="CIN-SESSION-01",
            nom="TEST",
            prenoms="Session",
            sexe="M",
            date_naissance=date(1990, 1, 1),
            statut=Statut.FONCTIONNAIRE,
            direction=self.direction,
        )
        self.utilisateur = Utilisateur.objects.create_user(
            username="session-test",
            password="Test-Password-123!",
            role=Role.AGENT,
            personnel=personnel,
        )

    def test_nouveau_jeton_inclut_le_debut_de_session(self):
        jeton = ConnexionSerializer.get_token(self.utilisateur)
        debut = jeton.get("session_started")
        self.assertIsInstance(debut, int)
        self.assertLessEqual(abs(int(timezone.now().timestamp()) - debut), 3)
        self.assertEqual(jeton.access_token.get("session_started"), debut)

    def test_renouvellement_refuse_apres_la_limite_absolue_meme_si_exp_valide(self):
        jeton = ConnexionSerializer.get_token(self.utilisateur)
        jeton["session_started"] = int((timezone.now() - timedelta(hours=9)).timestamp())
        # Simule un refresh token techniquement non expiré mais issu d'une session trop ancienne.
        jeton.set_exp(lifetime=timedelta(hours=1))
        serializer = SessionLimiteeTokenRefreshSerializer(data={"refresh": str(jeton)})
        with self.assertRaises(InvalidToken):
            serializer.is_valid(raise_exception=True)

    def test_access_token_refuse_apres_la_limite_absolue(self):
        jeton = ConnexionSerializer.get_token(self.utilisateur)
        jeton["session_started"] = int((timezone.now() - timedelta(hours=9)).timestamp())
        access = jeton.access_token
        access.set_exp(lifetime=timedelta(minutes=5))

        client = APIClient()
        client.cookies["men_access"] = str(access)
        response = client.get("/api/auth/moi/", HTTP_HOST="localhost")

        self.assertEqual(response.status_code, 401, getattr(response, "data", None))

    def test_connexion_est_limitee_par_minute_et_par_heure(self):
        rates = {"connexion_minute": "1/minute", "connexion_heure": "5/hour"}
        with (
            patch.object(ConnexionParMinuteThrottle, "THROTTLE_RATES", rates),
            patch.object(ConnexionParHeureThrottle, "THROTTLE_RATES", rates),
        ):
            cache.clear()
            client = APIClient(enforce_csrf_checks=True)
            csrf = client.get("/api/auth/csrf/", HTTP_HOST="localhost").data["csrfToken"]
            corps = {"identifiant": "IM-INEXISTANT", "password": "mauvais-mot-de-passe"}
            premiere = client.post(
                "/api/auth/session/connexion/", corps, format="json",
                HTTP_HOST="localhost", HTTP_X_CSRFTOKEN=csrf,
            )
            seconde = client.post(
                "/api/auth/session/connexion/", corps, format="json",
                HTTP_HOST="localhost", HTTP_X_CSRFTOKEN=csrf,
            )

        self.assertIn(premiere.status_code, (400, 401))
        self.assertEqual(seconde.status_code, 429, getattr(seconde, "data", None))
