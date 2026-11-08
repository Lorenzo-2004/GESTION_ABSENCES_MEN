from datetime import date, timedelta

from django.utils import timezone
from rest_framework.test import APIClient
from django.test import TestCase

from organisation.models import Direction, Service
from .enums import Role, Sexe, Statut
from .models import Personnel, Utilisateur


class GestionAgentsAdminAPITests(TestCase):
    """Vérifie le CRUD des fiches agents et les validations côté API."""

    def setUp(self):
        self.client = APIClient()
        self.direction = Direction.objects.create(
            code_direction="DIR001",
            nom_direction="Direction de test",
        )
        self.service = Service.objects.create(
            code_service="SRV001",
            nom_service="Service de test",
            direction=self.direction,
        )
        self.autre_direction = Direction.objects.create(
            code_direction="DIR002",
            nom_direction="Autre direction",
        )
        self.autre_service = Service.objects.create(
            code_service="SRV002",
            nom_service="Service externe",
            direction=self.autre_direction,
        )
        self.admin = Utilisateur.objects.create_user(
            username="admin_agents_test",
            password="Test-Password-123!",
            role=Role.ADMIN,
        )
        self.client.force_authenticate(user=self.admin)

    def payload(self, **modifications):
        donnees = {
            "im": "654321",
            "cin": "123456789012",
            "nom": "RAKOTO",
            "prenoms": "Jean Paul",
            "sexe": Sexe.MASCULIN,
            "date_naissance": "1990-01-15",
            "telephone": "+261 34 12 345 67",
            "email": "jean.paul@example.mg",
            "statut": Statut.FONCTIONNAIRE,
            "corps": "Encadreur",
            "grade": "Échelle IV 2e échelon",
            "direction": self.direction.pk,
            "service": self.service.pk,
        }
        donnees.update(modifications)
        return donnees

    def test_admin_peut_lister_les_agents_avec_les_champs_du_frontend(self):
        response = self.client.post(
            "/api/personnels/",
            self.payload(),
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(response.status_code, 201, response.data)

        listing = self.client.get("/api/personnels/", HTTP_HOST="localhost")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data["resultats"]), 1)
        agent = listing.data["resultats"][0]
        for champ in (
            "id_personnel", "im", "cin", "nom", "prenoms", "sexe",
            "date_naissance", "telephone", "email", "statut", "corps",
            "grade", "direction", "direction_libelle", "service",
            "service_libelle",
        ):
            self.assertIn(champ, agent)

    def test_admin_peut_modifier_et_supprimer_une_fiche(self):
        creation = self.client.post(
            "/api/personnels/", self.payload(), format="json", HTTP_HOST="localhost"
        )
        self.assertEqual(creation.status_code, 201, creation.data)
        identifiant = creation.data["id_personnel"]

        modification = self.client.patch(
            f"/api/personnels/{identifiant}/",
            {"nom": "RANDRIA"},
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(modification.status_code, 200, modification.data)
        self.assertEqual(modification.data["nom"], "RANDRIA")

        suppression = self.client.delete(
            f"/api/personnels/{identifiant}/", HTTP_HOST="localhost"
        )
        self.assertEqual(suppression.status_code, 204)
        self.assertFalse(Personnel.objects.filter(pk=identifiant).exists())

    def test_api_refuse_im_cin_et_noms_invalides(self):
        cas_invalides = (
            {"im": "12AB56"},
            {"cin": "12345"},
            {"nom": "RAKOTO123"},
            {"prenoms": "Jean@Paul"},
            {"telephone": "034ABC5678"},
            {"telephone": "1234"},
            {"date_naissance": (timezone.localdate() + timedelta(days=1)).isoformat()},
            {"corps": "12345"},
            {"corps": ""},
            {"grade": "!!!"},
            {"grade": ""},
            {"prenoms": ""},
        )
        for modifications in cas_invalides:
            with self.subTest(modifications=modifications):
                response = self.client.post(
                    "/api/personnels/",
                    self.payload(**modifications),
                    format="json",
                    HTTP_HOST="localhost",
                )
                self.assertEqual(response.status_code, 400, response.data)

    def test_api_refuse_une_cin_dupliquee_meme_si_elle_a_des_espaces(self):
        Personnel.objects.create(
            im="111111",
            cin="123 456 789 012",
            nom="DUPONT",
            prenoms="Marie",
            sexe=Sexe.FEMININ,
            date_naissance=date(1990, 1, 1),
            statut=Statut.FONCTIONNAIRE,
            corps="Corps",
            grade="Grade",
            direction=self.direction,
        )
        response = self.client.post(
            "/api/personnels/", self.payload(), format="json", HTTP_HOST="localhost"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("cin", response.data["erreurs"])

    def test_api_refuse_un_service_d_une_autre_direction(self):
        response = self.client.post(
            "/api/personnels/",
            self.payload(service=self.autre_service.pk),
            format="json",
            HTTP_HOST="localhost",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("service", response.data["erreurs"])

    def test_agent_ne_peut_pas_creer_une_fiche(self):
        personnel = Personnel.objects.create(
            im="222222",
            cin="222222222222",
            nom="AGENT",
            prenoms="Test",
            sexe=Sexe.MASCULIN,
            date_naissance=date(1990, 1, 1),
            statut=Statut.FONCTIONNAIRE,
            corps="Corps",
            grade="Grade",
            direction=self.direction,
        )
        agent = Utilisateur.objects.create_user(
            username="agent_agents_test",
            password="Test-Password-123!",
            role=Role.AGENT,
            personnel=personnel,
        )
        self.client.force_authenticate(user=agent)
        response = self.client.post(
            "/api/personnels/", self.payload(), format="json", HTTP_HOST="localhost"
        )
        self.assertEqual(response.status_code, 403)
