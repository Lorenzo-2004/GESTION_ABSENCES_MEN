from datetime import date
from rest_framework.test import APIClient
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from organisation.models import Direction, Service

from .models import Personnel, Role, Statut, Utilisateur


def creer_personnel(im="100001", cin="101011000001", **kw):
    d = kw.pop("direction", None) or Direction.objects.create(
        code_direction="DRH", nom_direction="Direction des Ressources Humaines"
    )
    defaults = dict(
        im=im, cin=cin, direction=d, nom="RAKOTO", prenoms="Jean", sexe="M",
        date_naissance=date(1990, 1, 1), statut=Statut.FONCTIONNAIRE,
    )
    defaults.update(kw)
    return Personnel.objects.create(**defaults)


class PersonnelTests(TestCase):
    def test_im_unique(self):
        p = creer_personnel()
        with self.assertRaises(IntegrityError), transaction.atomic():
            creer_personnel(direction=p.direction)  # même IM

    def test_service_doit_appartenir_a_la_direction(self):
        p = creer_personnel()
        autre = Direction.objects.create(code_direction="DAF", nom_direction="Affaires Financières")
        svc = Service.objects.create(code_service="S1", nom_service="Service 1", direction=autre)
        p.service = svc
        with self.assertRaises(ValidationError):
            p.clean()

    def test_stagiaire(self):
        p = creer_personnel(statut=Statut.STAGIAIRE)
        self.assertTrue(p.est_stagiaire)


class UtilisateurTests(TestCase):
    def test_compte_non_admin_exige_un_personnel(self):
        u = Utilisateur(username="agent1", role=Role.AGENT)
        with self.assertRaises(ValidationError):
            u.clean()

    def test_admin_sans_personnel_ok(self):
        u = Utilisateur(username="root", role=Role.ADMIN)
        u.clean()  # ne lève rien

    def test_compte_lie_au_personnel(self):
        p = creer_personnel()
        u = Utilisateur.objects.create_user(username="agent1", password="x12345678", role=Role.AGENT, personnel=p)
        self.assertEqual(p.compte, u)

class RecherchePersonnelParIMAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.direction = Direction.objects.create(
            code_direction="DRH",
            nom_direction="Direction des Ressources Humaines",
        )

        self.personnel = creer_personnel(
            im="474941",
            cin="101011000001",
            direction=self.direction,
        )

        self.autre_personnel = creer_personnel(
            im="474942",
            cin="101011000002",
            direction=self.direction,
            nom="ANDRY",
            prenoms="Jean Paul",
        )

        self.admin = Utilisateur.objects.create_user(
            username="admin_api_test",
            password="Test-Password-123!",
            role=Role.ADMIN,
        )

        self.agent = Utilisateur.objects.create_user(
            username="agent_api_test",
            password="Test-Password-123!",
            role=Role.AGENT,
            personnel=self.personnel,
        )

        self.url = "/api/personnels/par-im/"

    def test_recherche_refuse_les_utilisateurs_non_authentifies(self):
        response = self.client.get(
            self.url,
            {"im": self.personnel.im},
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 401)

    def test_recherche_refuse_un_im_manquant(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(
            self.url,
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 400)

    def test_recherche_retourne_le_personnel_par_im_exact(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(
            self.url,
            {"im": self.personnel.im},
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            str(response.data["im"]),
            str(self.personnel.im),
        )
        self.assertEqual(
            response.data["id_personnel"],
            self.personnel.pk,
        )

        self.assertIn("nom_complet", response.data)
        self.assertIn("direction_libelle", response.data)
        self.assertIn("service_libelle", response.data)

    def test_recherche_retourne_404_pour_un_im_inconnu(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(
            self.url,
            {"im": "999999"},
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 404)

    def test_agent_ne_peut_pas_consulter_un_autre_personnel(self):
        self.client.force_authenticate(user=self.agent)

        response = self.client.get(
            self.url,
            {"im": self.autre_personnel.im},
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 404)

    def test_agent_peut_retrouver_son_propre_dossier(self):
        self.client.force_authenticate(user=self.agent)

        response = self.client.get(
            self.url,
            {"im": self.personnel.im},
            HTTP_HOST="localhost",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["id_personnel"],
            self.personnel.pk,
        )