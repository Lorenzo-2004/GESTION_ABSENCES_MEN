"""Accès aux formulaires après visa : affectation au chef du service, jamais à la RH."""

from datetime import date

from rest_framework import status

from organisation.models import Service
from personnels.enums import Role
from personnels.models import Personnel, Utilisateur
from conges.models import DemandeAbsence
from conges.tests_api import BaseAPICase, MOT_DE_PASSE


class FormulairesServiceTests(BaseAPICase):
    def setUp(self):
        self.autre_service = Service.objects.create(
            code_service="S2", nom_service="Autre service", direction=self.direction,
        )
        self.autre_agent = Personnel.objects.create(
            im="IM999", cin="CINIM999", direction=self.direction, service=self.autre_service,
            nom="AGENTAUTRE", prenoms="Test", sexe="M",
            date_naissance=date(1990, 1, 1), statut="FONCTIONNAIRE",
            corps="Corps de test", grade="Grade de test",
        )
        self.autre_chef = Personnel.objects.create(
            im="IM998", cin="CINIM998", direction=self.direction, service=self.autre_service,
            nom="CHEFAUTRE", prenoms="Test", sexe="M",
            date_naissance=date(1990, 1, 1), statut="FONCTIONNAIRE",
            corps="Corps de test", grade="Grade de test",
        )
        self.compte_autre_chef = Utilisateur.objects.create_user(
            username="uIM998", password=MOT_DE_PASSE,
            role=Role.CHEF_SERVICE, personnel=self.autre_chef,
        )

        def demande(personnel, statut, type_absence="PERMISSION"):
            return DemandeAbsence.objects.create(
                personnel=personnel, type_absence=type_absence,
                statut_demande=statut, motif="Test classement",
                date_debut=date(2026, 11, 11), date_fin=date(2026, 11, 12),
                nombre_jours=2, lieu_jouissance="Antananarivo",
            )

        self.approuvee = demande(self.agent, "APPROUVE_CS")
        self.validee = demande(self.agent, "VALIDE_DIR")
        self.archivee = demande(self.agent, "ARCHIVEE")
        self.attente = demande(self.agent, "EN_ATTENTE")
        self.sans_pdf = demande(self.agent, "APPROUVE_CS", "MISSION")
        self.autre_demande = demande(self.autre_agent, "APPROUVE_CS")

    def test_chef_retrouve_uniquement_pdf_de_son_service_apres_visa(self):
        self.connecter(self.compte_chef)
        reponse = self.client.get("/api/demandes/formulaires-service/")
        self.assertEqual(reponse.status_code, status.HTTP_200_OK, reponse.data)
        identifiants = {ligne["id_demande"] for ligne in reponse.data["resultats"]}
        self.assertEqual(identifiants, {
            self.approuvee.pk, self.validee.pk, self.archivee.pk,
        })

    def test_rh_agent_et_directeur_ne_peuvent_lister_les_pdf(self):
        for compte in (self.compte_rh, self.compte_agent, self.compte_directeur):
            with self.subTest(compte=compte.username):
                self.connecter(compte)
                reponse = self.client.get("/api/demandes/formulaires-service/")
                self.assertEqual(reponse.status_code, status.HTTP_403_FORBIDDEN)

    def test_autre_chef_ne_retrouve_pas_les_pdf_de_mon_service(self):
        self.connecter(self.compte_autre_chef)
        reponse = self.client.get("/api/demandes/formulaires-service/")
        self.assertEqual(reponse.status_code, status.HTTP_200_OK, reponse.data)
        self.assertEqual(
            [ligne["id_demande"] for ligne in reponse.data["resultats"]],
            [self.autre_demande.pk],
        )
        inaccessible = self.client.get(f"/api/demandes/{self.approuvee.pk}/formulaire/")
        self.assertEqual(inaccessible.status_code, status.HTTP_404_NOT_FOUND)

    def test_rh_ne_peut_telecharger_pdf_apres_visa_meme_via_url_directe(self):
        self.connecter(self.compte_rh)
        for demande in (self.approuvee, self.validee, self.archivee):
            with self.subTest(statut=demande.statut_demande):
                reponse = self.client.get(f"/api/demandes/{demande.pk}/formulaire/")
                self.assertEqual(reponse.status_code, status.HTTP_403_FORBIDDEN)

    def test_pdf_avant_visa_conserve_son_fonctionnement(self):
        self.connecter(self.compte_rh)
        # Les requêtes avant visa suivent le comportement existant : elles
        # ne doivent pas être rejetées par le nouveau contrôle d'accès (403).
        reponse = self.client.get(f"/api/demandes/{self.attente.pk}/formulaire/")
        self.assertNotEqual(reponse.status_code, status.HTTP_403_FORBIDDEN)
