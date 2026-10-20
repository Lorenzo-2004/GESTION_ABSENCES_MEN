
from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from organisation.models import Direction
from .models import Personnel, Role, Statut, Utilisateur


class GestionComptesAdminAPITests(TestCase):
    """Vérifie la modification des comptes depuis l'API administrateur."""

    def setUp(self):
        self.client = APIClient()

        self.direction = Direction.objects.create(
            code_direction="TESTADM",
            nom_direction="Direction de test administration",
        )

        self.admin = Utilisateur.objects.create_user(
            username="admin_test_comptes",
            password="Admin-Test-Password-123!",
            role=Role.ADMIN,
        )

        self.personnel = Personnel.objects.create(
            im="IMTESTADM001",
            cin="CINTESTADM001",
            direction=self.direction,
            nom="TEST",
            prenoms="Agent Administration",
            sexe="M",
            date_naissance=date(1990, 1, 1),
            statut=Statut.FONCTIONNAIRE,
        )

        self.compte = Utilisateur.objects.create_user(
            username=self.personnel.im,
            password="Ancien-MotDePasse-123!",
            role=Role.AGENT,
            personnel=self.personnel,
        )

        self.client.force_authenticate(user=self.admin)

    def test_modifier_role_statut_email_et_mot_de_passe(self):
        """PATCH doit enregistrer les modifications et renvoyer le compte."""

        url = f"/api/utilisateurs/{self.compte.pk}/"

        reponse = self.client.patch(
            url,
            {
                "email": "agent.modifie@example.mg",
                "role": "ROLE_RH",
                "is_active": False,
                "password": "Nouveau-MotDePasse-123!",
            },
            format="json",
            HTTP_HOST="localhost",
        )

        self.assertEqual(
            reponse.status_code,
            200,
            getattr(reponse, "data", reponse.content),
        )

        self.compte.refresh_from_db()

        self.assertEqual(self.compte.email, "agent.modifie@example.mg")
        self.assertEqual(self.compte.role, Role.RH)
        self.assertFalse(self.compte.is_active)
        self.assertTrue(
            self.compte.check_password("Nouveau-MotDePasse-123!")
        )

        # Vérifie aussi que l'API renvoie bien le compte modifié.
        self.assertEqual(reponse.data["id"], self.compte.pk)
        self.assertEqual(reponse.data["role"], "ROLE_RH")
        self.assertFalse(reponse.data["is_active"])
