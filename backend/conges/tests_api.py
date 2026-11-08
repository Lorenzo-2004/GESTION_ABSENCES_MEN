"""Tests de la couche API REST (CDC §5.1) : authentification, RBAC et règles métier."""

from datetime import date
from io import BytesIO
import base64
import hashlib

from PIL import Image, ImageDraw

import pdfplumber
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from pypdf import PdfReader
from rest_framework import status
from rest_framework.test import APITestCase

from organisation.models import Direction, Service
from personnels.enums import Role, Statut
from personnels.models import Personnel, Utilisateur

from .models import DecisionConge, DemandeAbsence, SoldeConge, TraceSignature


def traits_du_bloc_type(contenu_pdf):
    """Traits horizontaux du bloc « DEMANDE DE : » : [(x début, x fin, distance du haut)]."""
    with pdfplumber.open(BytesIO(contenu_pdf)) as pdf:
        return sorted(
            (round(t["x0"], 1), round(t["x1"], 1), round(t["top"], 1))
            for t in pdf.pages[0].lines
            if 150 < t["top"] < 215 and t["x0"] > 380 and abs(t["top"] - t["bottom"]) < 2
        )


def _signature_test_data_url():
    image = Image.new("RGBA", (720, 180), (0, 0, 0, 0))
    dessin = ImageDraw.Draw(image)
    dessin.line([(35, 115), (95, 55), (140, 120), (205, 60), (275, 115), (330, 90), (390, 105)], fill=(17, 24, 39, 255), width=5)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


SIGNATURE_TEST_DATA_URI = _signature_test_data_url()

MOT_DE_PASSE = "MotDePasse!2026"


class BaseAPICase(APITestCase):
    """Jeu de données commun : un service, un agent, un chef, un directeur, la RH."""

    @classmethod
    def setUpTestData(cls):
        cls.direction = Direction.objects.create(code_direction="DRH", nom_direction="DRH")
        cls.service = Service.objects.create(
            code_service="S1", nom_service="Service 1", direction=cls.direction
        )

        def creer(im, role, statut=Statut.FONCTIONNAIRE, service=None):
            personnel = Personnel.objects.create(
                im=im, cin=f"CIN{im}", direction=cls.direction, service=service,
                nom=f"NOM{im}", prenoms="Test", sexe="M",
                date_naissance=date(1990, 1, 1), statut=statut,
                corps="Corps de test", grade="Grade de test", email=f"{im.lower()}@men.local",
            )
            compte = Utilisateur.objects.create_user(
                username=f"u{im}", password=MOT_DE_PASSE, role=role, personnel=personnel
            )
            return personnel, compte

        cls.agent, cls.compte_agent = creer("IM001", Role.AGENT, service=cls.service)
        cls.chef, cls.compte_chef = creer("IM002", Role.CHEF_SERVICE, service=cls.service)
        cls.directeur, cls.compte_directeur = creer("IM003", Role.DIRECTEUR)
        cls.rh, cls.compte_rh = creer("IM004", Role.RH)

    def connecter(self, compte):
        reponse = self.client.post(
            "/api/auth/connexion/",
            {"username": compte.username, "password": MOT_DE_PASSE},
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_200_OK, reponse.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {reponse.data['access']}")
        return reponse

    def activer_agent(self, personnel=None, annees="2026"):
        """La RH enregistre et active la décision annuelle (RG-04)."""
        self.connecter(self.compte_rh)
        reponse = self.client.post(
            "/api/decisions/",
            {
                "numero_decision": f"DEC-{annees}-{(personnel or self.agent).im}",
                "personnel": (personnel or self.agent).pk,
                "direction": self.direction.pk,
                "annees_titre": annees,
                "date_emission": "2026-01-05",
                "budget": "Budget Général",
                "imputation_budgetaire": "IMPUTATION-TEST",
                "corps_grade": "Corps/Grade test",
                "signataire": "MEN - Test",
            },
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        activation = self.client.post(
            f"/api/decisions/{reponse.data['id_decision']}/activer/", format="json"
        )
        self.assertEqual(activation.status_code, status.HTTP_200_OK, activation.data)
        self.client.credentials()
        return reponse.data


class AuthentificationTests(BaseAPICase):
    def test_connexion_renvoie_jetons_et_profil(self):
        reponse = self.connecter(self.compte_agent)
        self.assertIn("access", reponse.data)
        self.assertIn("refresh", reponse.data)
        self.assertEqual(reponse.data["utilisateur"]["role"], Role.AGENT)

    def test_acces_refuse_sans_jeton(self):
        reponse = self.client.get("/api/mes-droits/")
        self.assertEqual(reponse.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_moi_renvoie_le_personnel_lie(self):
        self.connecter(self.compte_agent)
        reponse = self.client.get("/api/auth/moi/")
        self.assertEqual(reponse.status_code, status.HTTP_200_OK)
        self.assertEqual(reponse.data["personnel"]["im"], "IM001")

    def test_deconnexion_revoque_le_jeton(self):
        jetons = self.connecter(self.compte_agent).data
        reponse = self.client.post(
            "/api/auth/deconnexion/", {"refresh": jetons["refresh"]}, format="json"
        )
        self.assertEqual(reponse.status_code, status.HTTP_205_RESET_CONTENT)


class DemandeAPITests(BaseAPICase):
    def test_regle_tranche_annuelle_premiere_puis_tranches_suivantes(self):
        self.connecter(self.compte_agent)

        premiere_regle = self.client.get(
            "/api/demandes/regle-tranche-annuelle/",
            {"annee_titre": 2026},
        )
        self.assertEqual(premiere_regle.status_code, status.HTTP_200_OK, premiere_regle.data)
        self.assertTrue(premiere_regle.data["premiere_tranche"])
        self.assertEqual(premiere_regle.data["jours_obligatoires"], 15)
        self.assertEqual(premiere_regle.data["jours_maximum"], 15)

        DemandeAbsence.objects.create(
            personnel=self.agent,
            type_absence="CONGE_ANNUEL",
            motif="Première tranche de test",
            date_debut=date(2026, 3, 2),
            date_fin=date(2026, 3, 16),
            annee_titre=2026,
            nombre_jours=15,
            lieu_jouissance="Antananarivo",
            statut_demande="EN_ATTENTE",
        )

        tranche_suivante = self.client.get(
            "/api/demandes/regle-tranche-annuelle/",
            {"annee_titre": 2026},
        )
        self.assertEqual(tranche_suivante.status_code, status.HTTP_200_OK, tranche_suivante.data)
        self.assertFalse(tranche_suivante.data["premiere_tranche"])
        self.assertIsNone(tranche_suivante.data["jours_obligatoires"])
        self.assertEqual(tranche_suivante.data["jours_minimum"], 1)
        self.assertEqual(tranche_suivante.data["jours_maximum"], 15)

    @override_settings(MEN_APPLIQUER_DELAIS_REGLEMENTAIRES=False)
    def test_api_impose_15_jours_pour_premiere_tranche_et_15_max_apres(self):
        self.activer_agent(self.agent, annees="2026")
        self.connecter(self.compte_agent)

        def soumettre_annuel(debut, fin):
            return self.client.post(
                "/api/demandes/",
                {
                    "signature_agent": SIGNATURE_TEST_DATA_URI,
                    "motif": "Congé annuel de test",
                    "lieu_jouissance": "Antananarivo",
                    "type_absence": "CONGE_ANNUEL",
                    "annee_titre": 2026,
                    "date_debut": debut,
                    "date_fin": fin,
                },
                format="json",
            )

        trop_courte = soumettre_annuel("2026-03-02", "2026-03-15")
        self.assertEqual(trop_courte.status_code, status.HTTP_400_BAD_REQUEST, trop_courte.data)
        self.assertIn("date_fin", trop_courte.data.get("erreurs", {}))

        premiere = soumettre_annuel("2026-03-02", "2026-03-16")
        self.assertEqual(premiere.status_code, status.HTTP_201_CREATED, premiere.data)
        self.assertEqual(premiere.data["nombre_jours"], 15)

        suivante = soumettre_annuel("2026-06-01", "2026-06-10")
        self.assertEqual(suivante.status_code, status.HTTP_201_CREATED, suivante.data)
        self.assertEqual(suivante.data["nombre_jours"], 10)

        depassement = soumettre_annuel("2026-09-01", "2026-09-16")
        self.assertEqual(depassement.status_code, status.HTTP_400_BAD_REQUEST, depassement.data)

    def test_chef_saisit_pour_un_agent_sans_signature_obligatoire(self):
        """La saisie déléguée conserve l'acteur chef sans exiger la signature de l'agent."""
        self.connecter(self.compte_chef)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "personnel": self.agent.pk,
                "motif": "Permission saisie par le chef pour l'agent",
                "lieu_jouissance": "Antananarivo",
                "type_absence": "PERMISSION",
                "date_debut": "2026-03-02",
                "date_fin": "2026-03-03",
            },
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        demande = DemandeAbsence.objects.get(pk=reponse.data["id_demande"])
        self.assertEqual(demande.personnel_id, self.agent.pk)
        self.assertFalse(demande.signature_agent)
        self.assertEqual(demande.signature_agent_sha256, "")
        self.assertIsNone(demande.date_signature_agent)
        self.assertIsNone(demande.signature_agent_compte_id)

        trace = demande.traces_signature.get(
            evenement=TraceSignature.Evenement.DEMANDE_SAISIE_DELEGUEE
        )
        self.assertEqual(trace.acteur_id_snapshot, self.compte_chef.pk)
        self.assertEqual(trace.details["personnel_cible_im"], self.agent.im)
        self.assertEqual(trace.details["signature_demandeur"], "non_fournie_non_obligatoire")

    def test_chef_ne_peut_pas_saisir_sans_signature_pour_un_autre_service(self):
        service_externe = Service.objects.create(
            code_service="S2", nom_service="Service externe", direction=self.direction
        )
        agent_externe = Personnel.objects.create(
            im="IM005", cin="CINIM005", direction=self.direction, service=service_externe,
            nom="AGENTEXTERNE", prenoms="Test", sexe="M",
            date_naissance=date(1990, 1, 1), statut=Statut.FONCTIONNAIRE,
            corps="Corps de test", grade="Grade de test", email="im005@men.local",
        )
        self.connecter(self.compte_chef)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "personnel": agent_externe.pk,
                "motif": "Demande hors périmètre",
                "lieu_jouissance": "Antananarivo",
                "type_absence": "PERMISSION",
                "date_debut": "2026-03-02",
                "date_fin": "2026-03-03",
            },
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_403_FORBIDDEN, reponse.data)
        self.assertFalse(DemandeAbsence.objects.filter(personnel=agent_externe).exists())

    def test_demande_deleguee_sans_signature_genere_le_pdf_officiel(self):
        self.connecter(self.compte_chef)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "personnel": self.agent.pk,
                "motif": "Permission saisie par le chef pour le PDF",
                "lieu_jouissance": "Antananarivo",
                "type_absence": "PERMISSION",
                "date_debut": "2026-03-02",
                "date_fin": "2026-03-03",
            },
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        demande_id = reponse.data["id_demande"]
        pdf = self.client.get(f"/api/demandes/{demande_id}/formulaire/")
        self.assertEqual(pdf.status_code, status.HTTP_200_OK, getattr(pdf, "data", None))
        contenu = b"".join(pdf.streaming_content)
        self.assertTrue(contenu.startswith(b"%PDF-"))

    def test_agent_soumet_une_permission(self):
        self.connecter(self.compte_agent)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "PERMISSION",
                "date_debut": "2026-03-02",
                "date_fin": "2026-03-03",
            },
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        self.assertEqual(reponse.data["nombre_jours"], 2)
        self.assertEqual(reponse.data["statut_demande"], "EN_ATTENTE")
        self.assertTrue(reponse.data["numero_enregistrement"].startswith("DA-"))
        self.assertEqual(len(reponse.data["signature_agent_sha256"]), 64)
        self.assertEqual(reponse.data["signature_agent_compte"], self.compte_agent.username)
        self.assertIsNotNone(reponse.data["date_signature_agent"])

    def test_signature_est_obligatoire_avant_soumission(self):
        self.connecter(self.compte_agent)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "motif": "Motif de test", "lieu_jouissance": "Antananarivo",
                "type_absence": "PERMISSION", "date_debut": "2026-03-02",
                "date_fin": "2026-03-03",
            },
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_400_BAD_REQUEST, reponse.data)
        self.assertIn("signature_agent", reponse.data.get("erreurs", {}))

    def test_api_refuse_permission_depassant_plafond_mensuel(self):
        self.connecter(self.compte_agent)

        reponse = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "PERMISSION",
                "date_debut": "2026-03-02",
                "date_fin": "2026-03-05",
            },
            format="json",
        )

        self.assertEqual(
            reponse.status_code,
            status.HTTP_400_BAD_REQUEST,
            reponse.data,
        )

    def test_api_plafond_mensuel_autorisation(self):
        self.connecter(self.compte_agent)

        # Première demande : 5 jours, autorisée.
        premiere = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "AUTORISATION",
                "date_debut": "2026-03-02",
                "date_fin": "2026-03-06",
            },
            format="json",
        )

        self.assertEqual(
            premiere.status_code,
            status.HTTP_201_CREATED,
            premiere.data,
        )
        self.assertEqual(premiere.data["nombre_jours"], 5)

        # Une journée supplémentaire dans le même mois doit être refusée.
        seconde = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "AUTORISATION",
                "date_debut": "2026-03-16",
                "date_fin": "2026-03-16",
            },
            format="json",
        )

        self.assertEqual(
            seconde.status_code,
            status.HTTP_400_BAD_REQUEST,
            seconde.data,
        )

    def test_api_cumule_permissions_dans_le_meme_mois(self):
        self.connecter(self.compte_agent)

        # Première permission : 2 jours en mars.
        premiere = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "PERMISSION",
                "date_debut": "2026-03-02",
                "date_fin": "2026-03-03",
            },
            format="json",
        )
        self.assertEqual(
            premiere.status_code,
            status.HTTP_201_CREATED,
            premiere.data,
        )
        self.assertEqual(premiere.data["nombre_jours"], 2)

        # Deuxième permission : 2 jours supplémentaires dans le même mois.
        # Le cumul de 4 jours doit dépasser le plafond mensuel de 3 jours.
        seconde = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "PERMISSION",
                "date_debut": "2026-03-10",
                "date_fin": "2026-03-11",
            },
            format="json",
        )
        self.assertEqual(
            seconde.status_code,
            status.HTTP_400_BAD_REQUEST,
            seconde.data,
        )

    def test_api_permission_repartie_sur_deux_mois(self):
        self.connecter(self.compte_agent)

        # 30 janvier au 1er février : 2 jours en janvier et 1 en février.
        reponse = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "PERMISSION",
                "date_debut": "2026-01-30",
                "date_fin": "2026-02-01",
            },
            format="json",
        )

        self.assertEqual(
            reponse.status_code,
            status.HTTP_201_CREATED,
            reponse.data,
        )
        self.assertEqual(reponse.data["nombre_jours"], 3)

    def test_nombre_jours_est_calcule_par_backend(self):
        self.connecter(self.compte_agent)

        reponse = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "PERMISSION",
                "date_debut": "2026-03-02",
                "date_fin": "2026-03-03",
                "nombre_jours": 99,
            },
            format="json",
        )

        self.assertEqual(
            reponse.status_code,
            status.HTTP_201_CREATED,
            reponse.data,
        )
        self.assertEqual(reponse.data["nombre_jours"], 2)

    def test_date_fin_anterieure_refusee(self):
        self.connecter(self.compte_agent)

        reponse = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "PERMISSION",
                "date_debut": "2026-03-03",
                "date_fin": "2026-03-02",
            },
            format="json",
        )

        self.assertEqual(
            reponse.status_code,
            status.HTTP_400_BAD_REQUEST,
            reponse.data,
        )

    def test_regle_metier_renvoie_400_pas_500(self):
        """RG-02 : un stagiaire ne peut pas demander un congé annuel -> 400 structuré."""
        stagiaire = Personnel.objects.create(
            im="IM999", cin="CIN999", direction=self.direction, service=self.service,
            nom="STAG", prenoms="Test", sexe="M", date_naissance=date(2000, 1, 1),
            statut=Statut.STAGIAIRE,
        )
        Utilisateur.objects.create_user(
            username="ustag", password=MOT_DE_PASSE, role=Role.AGENT, personnel=stagiaire
        )
        self.connecter(Utilisateur.objects.get(username="ustag"))
        reponse = self.client.post(
            "/api/demandes/",
            {"signature_agent": SIGNATURE_TEST_DATA_URI, "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "CONGE_ANNUEL", "date_debut": "2026-03-02", "date_fin": "2026-03-06"},
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", reponse.data)
        self.assertIn("erreurs", reponse.data)

        # La validation intervient après serializer.save() dans le flux API.
        # La transaction doit annuler cette création si une règle métier échoue.
        from conges.models import DemandeAbsence

        self.assertFalse(
            DemandeAbsence.objects.filter(personnel=stagiaire).exists(),
            "Une demande invalide ne doit pas être conservée en base.",
        )

    def test_directeur_voit_les_demandes_de_toutes_les_directions_rg17(self):
        """La liste utilisée pour la vue consolidée du Directeur est ministérielle."""
        from conges.models import DemandeAbsence

        autre_direction = Direction.objects.create(code_direction="D2", nom_direction="Direction 2")
        autre_service = Service.objects.create(
            code_service="S2", nom_service="Service 2", direction=autre_direction
        )
        autre_personnel = Personnel.objects.create(
            im="IM-GLOBAL", cin="CIN-GLOBAL", direction=autre_direction, service=autre_service,
            nom="GLOBAL", prenoms="Test", sexe="M", date_naissance=date(1990, 1, 1),
            statut=Statut.FONCTIONNAIRE, corps="Corps de test", grade="Grade de test",
        )
        demande_autre = DemandeAbsence.objects.create(
            personnel=autre_personnel, type_absence="PERMISSION",
            date_debut=date(2026, 4, 1), date_fin=date(2026, 4, 1),
            nombre_jours=1, motif="Test global", lieu_jouissance="Antananarivo",
        )

        self.connecter(self.compte_directeur)
        reponse = self.client.get("/api/demandes/")
        ids = {item["id_demande"] for item in reponse.data["resultats"]}
        self.assertIn(demande_autre.pk, ids)

    def test_agent_ne_voit_que_ses_demandes(self):
        """RG-06 : isolation des données."""
        autre = Personnel.objects.create(
            im="IM777", cin="CIN777", direction=self.direction, service=self.service,
            nom="AUTRE", prenoms="Test", sexe="M", date_naissance=date(1990, 1, 1),
            statut=Statut.FONCTIONNAIRE,
        )
        Utilisateur.objects.create_user(
            username="uautre", password=MOT_DE_PASSE, role=Role.AGENT, personnel=autre
        )
        from conges.enums import TypeAbsence
        from conges.models import DemandeAbsence

        DemandeAbsence.objects.create(
            personnel=autre, type_absence=TypeAbsence.PERMISSION,
            date_debut=date(2026, 1, 5), date_fin=date(2026, 1, 5), nombre_jours=1,
        )
        self.connecter(self.compte_agent)
        reponse = self.client.get("/api/demandes/")
        self.assertEqual(reponse.data["total"], 0)


class CircuitValidationAPITests(BaseAPICase):
    def _conge_annuel(self):
        self.activer_agent(self.agent)
        self.connecter(self.compte_agent)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "CONGE_ANNUEL",
                "annee_titre": 2026,
                "date_debut": "2026-03-02",
                "date_fin": "2026-03-16",
                "motif": "Congé annuel demandé",
                "lieu_jouissance": "Antananarivo",
            },
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        return reponse.data["id_demande"]
    
    def test_conge_annuel_15_jours_ne_compte_pas_sa_demande_deux_fois(self):
        """Une demande de 15 jours déjà enregistrée par la vue ne s'engage pas deux fois."""
        self.activer_agent(self.agent)
        self.connecter(self.compte_agent)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "CONGE_ANNUEL",
                "annee_titre": 2026,
                "date_debut": "2026-03-02",
                "date_fin": "2026-03-16",
                "motif": "Congé annuel demandé",
                "lieu_jouissance": "Antananarivo",
            },
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        self.assertEqual(reponse.data["nombre_jours"], 15)

    def test_annee_titre_choisie_utilisee_pour_solde_et_decompte(self):
        """Le congé est imputé à l'année choisie, même si les dates sont en 2026."""
        from .models import SoldeConge

        # La RH active uniquement les droits de 2025 pour cet agent.
        self.activer_agent(self.agent, annees="2025")

        self.connecter(self.compte_agent)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "CONGE_ANNUEL",
                "annee_titre": 2025,
                "date_debut": "2026-11-02",
                "date_fin": "2026-11-16",
                "motif": "Congé annuel demandé",
                "lieu_jouissance": "Antananarivo",
            },
            format="json",
        )

        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        self.assertEqual(reponse.data["annee_titre"], 2025)
        self.assertEqual(reponse.data["nombre_jours"], 15)

        demande_id = reponse.data["id_demande"]

        # Visa du chef de service.
        self.connecter(self.compte_chef)
        visa = self.client.post(
            f"/api/demandes/{demande_id}/avis/",
            {"avis": "FAVORABLE", "observation": "Avis favorable"},
            format="json",
        )
        self.assertEqual(visa.status_code, status.HTTP_200_OK, visa.data)

        # Décision du directeur.
        self.connecter(self.compte_directeur)
        decision = self.client.post(
            f"/api/demandes/{demande_id}/avis/",
            {"avis": "FAVORABLE", "observation": "Accordé"},
            format="json",
        )
        self.assertEqual(
            decision.status_code,
            status.HTTP_200_OK,
            decision.data,
        )

        # Les 15 jours doivent être débités du solde de 2025.
        solde_2025 = SoldeConge.objects.get(
            personnel=self.agent,
            annee=2025,
        )
        self.assertEqual(solde_2025.jours_pris, 15)
        self.assertEqual(solde_2025.solde_restant, 15)

        # Aucun solde 2026 ne doit être créé ou débité par cette demande.
        self.assertFalse(
            SoldeConge.objects.filter(
                personnel=self.agent,
                annee=2026,
            ).exists()
        )

    def test_circuit_complet_et_decompte_du_solde(self):
        demande_id = self._conge_annuel()

        self.connecter(self.compte_chef)
        visa = self.client.post(
            f"/api/demandes/{demande_id}/avis/",
            {"avis": "FAVORABLE", "observation": "Avis favorable"},
            format="json",
        )
        self.assertEqual(visa.status_code, status.HTTP_200_OK, visa.data)
        self.assertEqual(visa.data["statut_demande"], "APPROUVE_CS")

        from .models import SoldeConge
        solde_apres_chef = SoldeConge.objects.get(personnel=self.agent, annee=2026)
        self.assertEqual(solde_apres_chef.jours_pris, 15)

        self.connecter(self.compte_directeur)
        decision = self.client.post(
            f"/api/demandes/{demande_id}/avis/",
            {"avis": "FAVORABLE", "observation": "Accordé"},
            format="json",
        )
        self.assertEqual(decision.status_code, status.HTTP_200_OK, decision.data)
        self.assertEqual(decision.data["statut_demande"], "VALIDE_DIR")
        solde_apres_directeur = SoldeConge.objects.get(personnel=self.agent, annee=2026)
        self.assertEqual(solde_apres_directeur.jours_pris, 15)

        self.connecter(self.compte_agent)
        droits = self.client.get("/api/mes-droits/?annee=2026")
        self.assertEqual(droits.data["jours_pris"], 15)
        self.assertEqual(droits.data["solde_restant"], 15)

    def test_agent_ne_peut_pas_valider(self):
        demande_id = self._conge_annuel()
        self.connecter(self.compte_agent)
        reponse = self.client.post(
            f"/api/demandes/{demande_id}/avis/", {"avis": "FAVORABLE"}, format="json"
        )
        self.assertEqual(reponse.status_code, status.HTTP_403_FORBIDDEN)

    def test_formulaire_pdf_genere(self):
        demande_id = self._conge_annuel()
        self.connecter(self.compte_agent)
        reponse = self.client.get(f"/api/demandes/{demande_id}/formulaire/")
        self.assertEqual(reponse.status_code, status.HTTP_200_OK)
        self.assertEqual(reponse["Content-Type"], "application/pdf")
        # Un vrai PDF, pas un flux vide : signature %PDF et contenu exploitable.
        contenu = b"".join(reponse.streaming_content)
        self.assertTrue(contenu.startswith(b"%PDF-"))
        self.assertGreater(len(contenu), 1500)

    def test_formulaire_pdf_contient_les_donnees_de_l_agent(self):
        """Le formulaire officiel est pré-rempli, pas un texte générique."""
        demande_id = self._conge_annuel()
        self.connecter(self.compte_agent)
        reponse = self.client.get(f"/api/demandes/{demande_id}/formulaire/")
        contenu = b"".join(reponse.streaming_content)

        with pdfplumber.open(BytesIO(contenu)) as pdf:
            texte = pdf.pages[0].extract_text() or ""

        page = PdfReader(BytesIO(contenu)).pages[0]
        ressources_image = [
            obj.get_object()
            for obj in page["/Resources"].get_object()["/XObject"].values()
            if obj.get_object().get("/Subtype") == "/Image"
        ]
        self.assertTrue(ressources_image, "Le scan original du formulaire doit rester le fond PDF.")
        # Le PDF contient aussi une image pour la signature agent (720x180).
        # Ne pas dépendre de l'ordre des XObject : pypdf peut lister la signature
        # avant l'image du formulaire après merge_page().
        fonds_formulaire = [
            image for image in ressources_image
            if (image.get("/Width"), image.get("/Height")) == (997, 1337)
        ]
        self.assertEqual(
            len(fonds_formulaire), 1,
            "Le scan officiel 997x1337 doit être conservé exactement une fois comme fond.",
        )

        # Les libellés du formulaire sont une image scannée et ne sont pas extractibles.
        # On vérifie le calque texte ajouté par-dessus.
        self.assertIn(self.agent.im, texte)
        self.assertIn("15", texte)
        self.assertIn("02/03/2026", texte)
        self.assertIn("16/03/2026", texte)
        self.assertIn("15", texte)  # solde restant après la demande dans ce scénario
        self.assertNotIn("X", texte)  # le type est souligné, plus coché
        mots = pdf.pages[0].extract_words()
        haut_fin = next(item["top"] for item in mots if item["text"] == "16/03/2026")
        jours_corps = [
            item["top"] for item in mots
            if item["text"] == "15" and 180 < item["x0"] < 350
        ]
        self.assertTrue(jours_corps, "Nombre de jours demandé absent du corps du formulaire.")
        # Sur le formulaire, « NOMBRE DE JOURS DEMANDES » est AU-DESSUS de la ligne DU/AU.
        self.assertLess(jours_corps[0], haut_fin)

    def test_formulaire_pdf_souligne_le_type_d_absence(self):
        """CONGE est souligné (et lui seul), pas coché d'un X."""
        demande_id = self._conge_annuel()  # congé annuel
        self.connecter(self.compte_agent)
        reponse = self.client.get(f"/api/demandes/{demande_id}/formulaire/")
        contenu = b"".join(reponse.streaming_content)

        page = PdfReader(BytesIO(contenu)).pages[0]
        image_xobjects = [
            obj.get_object()
            for obj in page["/Resources"].get_object()["/XObject"].values()
            if obj.get_object().get("/Subtype") == "/Image"
        ]
        # Une seconde image peut être présente : c'est la signature manuscrite
        # capturée à la soumission. La base du formulaire doit rester unique.
        fonds_formulaire = [
            image for image in image_xobjects
            if (image.get("/Width"), image.get("/Height")) == (997, 1337)
        ]
        self.assertEqual(len(fonds_formulaire), 1)

        traits = traits_du_bloc_type(contenu)
        self.assertEqual(len(traits), 1, traits)
        x0, x1, haut = traits[0]
        self.assertAlmostEqual(haut, 169.8, delta=1.5)  # sous « CONGE »
        self.assertAlmostEqual(x0, 398.5, delta=1.5)
        self.assertAlmostEqual(x1, 434.0, delta=1.5)

    def test_formulaire_pdf_affiche_annee_titre_choisie(self):
        """Le PDF affiche l'année choisie, indépendamment des dates du congé."""
        self.activer_agent(self.agent, annees="2025")
        self.connecter(self.compte_agent)

        reponse = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "CONGE_ANNUEL",
                "annee_titre": 2025,
                "date_debut": "2026-11-02",
                "date_fin": "2026-11-16",
                "motif": "Congé annuel demandé",
                "lieu_jouissance": "Antananarivo",
            },
            format="json",
        )

        self.assertEqual(
            reponse.status_code,
            status.HTTP_201_CREATED,
            reponse.data,
        )
        demande_id = reponse.data["id_demande"]

        pdf_reponse = self.client.get(
            f"/api/demandes/{demande_id}/formulaire/"
        )
        self.assertEqual(pdf_reponse.status_code, status.HTTP_200_OK)

        contenu = b"".join(pdf_reponse.streaming_content)

        with pdfplumber.open(BytesIO(contenu)) as pdf:
            texte = pdf.pages[0].extract_text() or ""

        self.assertIn("2025", texte)
        self.assertIn("02/11/2026", texte)
        self.assertIn("16/11/2026", texte)


class DecisionRHAPITests(BaseAPICase):
    def test_seule_la_rh_peut_creer_une_decision(self):
        self.connecter(self.compte_agent)
        reponse = self.client.post(
            "/api/decisions/",
            {
                "numero_decision": "DEC-X", "personnel": self.agent.pk,
                "direction": self.direction.pk, "annees_titre": "2026",
                "date_emission": "2026-01-05",
            },
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_403_FORBIDDEN)

    def test_lecture_des_decisions_reservee_a_la_rh_et_a_l_admin(self):
        """Les agents, chefs et directeurs ne doivent pas lire les décisions RH."""
        self.connecter(self.compte_rh)
        creation = self.client.post(
            "/api/decisions/",
            {
                "numero_decision": "DEC-LECTURE-RH",
                "personnel": self.agent.pk,
                "direction": self.direction.pk,
                "annees_titre": "2026",
                "date_emission": "2026-01-05",
            },
            format="json",
        )
        self.assertEqual(creation.status_code, status.HTTP_201_CREATED, creation.data)
        url_detail = f"/api/decisions/{creation.data['id_decision']}/"

        for compte in (self.compte_agent, self.compte_chef, self.compte_directeur):
            with self.subTest(role=compte.role):
                self.connecter(compte)
                self.assertEqual(
                    self.client.get("/api/decisions/").status_code,
                    status.HTTP_403_FORBIDDEN,
                )
                self.assertEqual(
                    self.client.get(url_detail).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

        # La RH conserve bien l'accès à la liste et au détail.
        self.connecter(self.compte_rh)
        self.assertEqual(self.client.get("/api/decisions/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(url_detail).status_code, status.HTTP_200_OK)

    def test_activation_refusee_pour_un_stagiaire(self):
        stagiaire = Personnel.objects.create(
            im="IM888", cin="CIN888", direction=self.direction, service=self.service,
            nom="STAG2", prenoms="Test", sexe="M", date_naissance=date(2000, 1, 1),
            statut=Statut.STAGIAIRE,
        )
        self.connecter(self.compte_rh)
        creation = self.client.post(
            "/api/decisions/",
            {
                "numero_decision": "DEC-STAG", "personnel": stagiaire.pk,
                "direction": self.direction.pk, "annees_titre": "2026",
                "date_emission": "2026-01-05",
            },
            format="json",
        )
        # Le modèle refuse déjà la décision au moment de l'enregistrement (RG-02).
        self.assertEqual(creation.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reporter_reliquats_via_api_maintient_jours_deja_pris(self):
        """La RH reporte le reliquat via l'API sans perdre les jours pris."""
        from .models import SoldeConge

        self.connecter(self.compte_rh)

        # Solde 2025 : 30 droits - 20 jours pris = 10 jours restants.
        SoldeConge.objects.create(
            personnel=self.agent,
            annee=2025,
            droit_annuel=30,
            jours_pris=20,
        )

        # Le solde 2026 existe déjà et 7 jours y ont été consommés.
        SoldeConge.objects.create(
            personnel=self.agent,
            annee=2026,
            droit_annuel=30,
            report_anterieur=5,
            jours_pris=7,
        )

        reponse = self.client.post(
            "/api/decisions/reporter-reliquats/",
            {"annee_source": 2025},
            format="json",
        )

        self.assertEqual(
            reponse.status_code,
            status.HTTP_200_OK,
            reponse.data,
        )
        self.assertEqual(reponse.data["annee_source"], 2025)
        self.assertEqual(reponse.data["annee_cible"], 2026)
        self.assertEqual(reponse.data["nombre_soldes_reportes"], 1)

        solde_2026 = SoldeConge.objects.get(
            personnel=self.agent,
            annee=2026,
        )

        self.assertEqual(solde_2026.droit_annuel, 30)
        self.assertEqual(solde_2026.report_anterieur, 10)
        self.assertEqual(solde_2026.jours_pris, 7)
        self.assertEqual(solde_2026.solde_restant, 33)


class ConformiteDiagrammesTests(BaseAPICase):
    """Endpoints exigés par les diagrammes UML de CONCEPTION/."""

    def test_scan_decision_ocr_repond(self):
        """sequence1 : POST /api/decisions/scan/ renvoie les données extraites."""
        self.connecter(self.compte_rh)
        scan = SimpleUploadedFile("decision.pdf", b"%PDF-1.4 scan simule")
        reponse = self.client.post("/api/decisions/scan/", {"fichier": scan})
        self.assertEqual(reponse.status_code, status.HTTP_200_OK, reponse.data)
        self.assertIn("donnees_extraites", reponse.data)
        self.assertIn("agent", reponse.data)
        # Sans moteur OCR installé, le service retombe proprement en saisie manuelle.
        self.assertEqual(reponse.data["donnees_extraites"]["source"], "SAISIE_MANUELLE")

    def test_scan_refuse_un_format_non_autorise(self):
        self.connecter(self.compte_rh)
        scan = SimpleUploadedFile("decision.exe", b"MZ")
        reponse = self.client.post("/api/decisions/scan/", {"fichier": scan})
        self.assertEqual(reponse.status_code, status.HTTP_400_BAD_REQUEST)

    def test_confirmer_est_alias_de_activer(self):
        """sequence1 : POST /api/decisions/{id}/confirmer/ active la décision."""
        self.connecter(self.compte_rh)
        creation = self.client.post(
            "/api/decisions/",
            {
                "numero_decision": "DEC-CONF", "personnel": self.agent.pk,
                "direction": self.direction.pk, "annees_titre": "2026",
                "date_emission": "2026-01-05",
                "budget": "Budget Général",
                "imputation_budgetaire": "IMPUTATION-TEST",
            },
            format="json",
        )
        self.assertEqual(creation.status_code, status.HTTP_201_CREATED)
        reponse = self.client.post(
            f"/api/decisions/{creation.data['id_decision']}/confirmer/", format="json"
        )
        self.assertEqual(reponse.status_code, status.HTTP_200_OK)
        self.assertTrue(reponse.data["est_valide"])

    def test_confirmer_refuse_decision_sans_imputation_budgetaire(self):
        """Une décision sans chapitre ne doit pas être activée : le PDF serait incomplet."""
        self.connecter(self.compte_rh)
        creation = self.client.post(
            "/api/decisions/",
            {
                "numero_decision": "DEC-CONF-SANS-IMPUTATION",
                "personnel": self.agent.pk,
                "direction": self.direction.pk,
                "annees_titre": "2026",
                "date_emission": "2026-01-05",
                "budget": "Budget Général",
            },
            format="json",
        )
        self.assertEqual(creation.status_code, status.HTTP_201_CREATED, creation.data)

        reponse = self.client.post(
            f"/api/decisions/{creation.data['id_decision']}/confirmer/", format="json"
        )
        self.assertEqual(reponse.status_code, status.HTTP_400_BAD_REQUEST, reponse.data)

        decision = DecisionConge.objects.get(pk=creation.data["id_decision"])
        self.assertFalse(decision.est_valide)
        self.assertFalse(SoldeConge.objects.filter(personnel=self.agent, annee=2026).exists())

    def _demande_permission(self, personnel_compte):
        self.connecter(personnel_compte)
        reponse = self.client.post(
            "/api/demandes/",
            {"signature_agent": SIGNATURE_TEST_DATA_URI, "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "PERMISSION", "date_debut": "2026-05-04", "date_fin": "2026-05-05"},
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        return reponse.data["id_demande"]

    def test_en_attente_service_liste_pour_le_chef(self):
        """sequence2 étape 1 : GET /api/demandes/en-attente-service/."""
        self._demande_permission(self.compte_agent)
        self.connecter(self.compte_chef)
        reponse = self.client.get("/api/demandes/en-attente-service/")
        self.assertEqual(reponse.status_code, status.HTTP_200_OK)
        self.assertEqual(len(reponse.data), 1)

    def test_rh_agit_comme_chef_de_service_dans_sa_file(self):
        self.rh.service = self.service
        self.rh.save()
        demande_id = self._demande_permission(self.compte_agent)

        self.connecter(self.compte_rh)
        file_service = self.client.get("/api/demandes/en-attente-service/")
        self.assertEqual(file_service.status_code, status.HTTP_200_OK, file_service.data)
        self.assertIn(demande_id, {item["id_demande"] for item in file_service.data})

        file_a_valider = self.client.get("/api/a-valider/")
        self.assertEqual(file_a_valider.status_code, status.HTTP_200_OK, file_a_valider.data)
        self.assertIn(demande_id, {item["id_demande"] for item in file_a_valider.data})

        visa = self.client.post(
            f"/api/demandes/{demande_id}/avis/",
            {"avis": "FAVORABLE", "observation": "Visa RH du service"},
            format="json",
        )
        self.assertEqual(visa.status_code, status.HTTP_200_OK, visa.data)
        self.assertEqual(visa.data["statut_demande"], "APPROUVE_CS")

    def test_demande_personnelle_rh_est_presentee_au_directeur(self):
        self.rh.service = self.service
        self.rh.save()
        self.activer_agent(self.rh, annees="2026")
        self.connecter(self.compte_rh)
        creation = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "CONGE_ANNUEL",
                "annee_titre": 2026,
                "date_debut": "2026-03-02",
                "date_fin": "2026-03-16",
                "motif": "Demande personnelle RH",
                "lieu_jouissance": "Antananarivo",
            },
            format="json",
        )
        self.assertEqual(creation.status_code, status.HTTP_201_CREATED, creation.data)
        demande_id = creation.data["id_demande"]

        # La demande personnelle RH ne doit pas apparaître dans la file de son propre service.
        self.connecter(self.compte_rh)
        file_service = self.client.get("/api/demandes/en-attente-service/")
        self.assertEqual(file_service.status_code, status.HTTP_200_OK, file_service.data)
        self.assertNotIn(demande_id, {item["id_demande"] for item in file_service.data})

        self.connecter(self.compte_directeur)
        file_direction = self.client.get("/api/demandes/en-attente-direction/")
        self.assertEqual(file_direction.status_code, status.HTTP_200_OK, file_direction.data)
        self.assertIn(demande_id, {item["id_demande"] for item in file_direction.data})

        decision = self.client.post(
            f"/api/demandes/{demande_id}/avis/",
            {"avis": "FAVORABLE", "observation": "Décision du directeur"},
            format="json",
        )
        self.assertEqual(decision.status_code, status.HTTP_200_OK, decision.data)
        self.assertEqual(decision.data["statut_demande"], "VALIDE_DIR")
        from conges.models import SoldeConge
        solde = SoldeConge.objects.get(personnel=self.rh, annee=2026)
        self.assertEqual(solde.jours_pris, 15)

    def test_en_attente_direction_apres_visa_chef(self):
        """sequence2 étape 2 : la demande visée arrive au directeur."""
        demande_id = self._demande_permission(self.compte_agent)
        self.connecter(self.compte_chef)
        self.client.post(
            f"/api/demandes/{demande_id}/avis/",
            {"avis": "FAVORABLE", "observation": "Motif valable"},
            format="json",
        )
        self.connecter(self.compte_directeur)
        reponse = self.client.get("/api/demandes/en-attente-direction/")
        self.assertEqual(reponse.status_code, status.HTTP_200_OK)
        self.assertEqual(len(reponse.data), 1)

    def test_validations_endpoint_unifie(self):
        """sequence2 : POST /api/validations/ enregistre le visa selon le rôle."""
        demande_id = self._demande_permission(self.compte_agent)
        self.connecter(self.compte_chef)
        reponse = self.client.post(
            "/api/validations/",
            {"demande": demande_id, "avis": "FAVORABLE", "observation": "Avis favorable"},
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_200_OK, reponse.data)
        self.assertEqual(reponse.data["statut_demande"], "APPROUVE_CS")

    def test_saisie_deleguee_par_le_chef_pour_un_agent(self):
        """useCase UC_SaisieChef_Delegated : le chef saisit pour un agent de son service."""
        self.connecter(self.compte_chef)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "personnel": self.agent.pk, "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "PERMISSION",
                "date_debut": "2026-06-01", "date_fin": "2026-06-02",
            },
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        self.assertEqual(reponse.data["personnel"], self.agent.pk)

    def test_saisie_deleguee_refusee_pour_un_agent_hors_service(self):
        """Un chef ne peut pas saisir pour un agent d'un autre service."""
        autre_dir = Direction.objects.create(code_direction="DAF", nom_direction="DAF")
        autre_svc = Service.objects.create(
            code_service="S9", nom_service="Service 9", direction=autre_dir
        )
        etranger = Personnel.objects.create(
            im="IM555", cin="CIN555", direction=autre_dir, service=autre_svc,
            nom="ETRANGER", prenoms="Test", sexe="M", date_naissance=date(1990, 1, 1),
            statut=Statut.FONCTIONNAIRE,
        )
        self.connecter(self.compte_chef)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "personnel": etranger.pk, "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "PERMISSION",
                "date_debut": "2026-06-01", "date_fin": "2026-06-02",
            },
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_403_FORBIDDEN)

    def test_agent_ne_peut_pas_saisir_pour_un_autre(self):
        autre = Personnel.objects.create(
            im="IM666", cin="CIN666", direction=self.direction, service=self.service,
            nom="VOISIN", prenoms="Test", sexe="M", date_naissance=date(1990, 1, 1),
            statut=Statut.FONCTIONNAIRE,
        )
        self.connecter(self.compte_agent)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "personnel": autre.pk, "motif": "Motif de test", "lieu_jouissance": "Antananarivo", "type_absence": "PERMISSION",
                "date_debut": "2026-06-01", "date_fin": "2026-06-02",
            },
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_403_FORBIDDEN)

    def test_planning_equipe(self):
        """useCase UC_Planning : GET /api/demandes/planning/."""
        self._demande_permission(self.compte_agent)
        self.connecter(self.compte_chef)
        reponse = self.client.get("/api/demandes/planning/?debut=2026-01-01&fin=2026-12-31")
        self.assertEqual(reponse.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(reponse.data), 1)
        self.assertEqual(reponse.data[0]["personnel_nom"], self.agent.nom_complet)


class SaisieFormulaireAPITests(BaseAPICase):
    """Maternité/paternité automatiques, justificatif facultatif, formulaire complet."""

    def _poster(self, corps):
        self.connecter(self.compte_agent)
        corps.setdefault("signature_agent", SIGNATURE_TEST_DATA_URI)
        return self.client.post("/api/demandes/", corps, format="json")

    def test_paternite_sans_dates_calcule_15_jours(self):
        reponse = self._poster({
            "type_absence": "PATERNITE", "motif": "Naissance", "lieu_jouissance": "Antananarivo",
            "date_evenement_prevue": "2026-03-15",
        })
        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        self.assertEqual(reponse.data["date_debut"], "2026-03-15")
        self.assertEqual(reponse.data["date_fin"], "2026-03-29")
        self.assertEqual(reponse.data["nombre_jours"], 15)
        self.assertIsNone(reponse.data["justificatif_url"])

    def test_paternite_sans_date_prevue_refusee(self):
        reponse = self._poster({
            "type_absence": "PATERNITE", "motif": "Naissance", "lieu_jouissance": "Antananarivo",
        })
        self.assertEqual(reponse.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("date_evenement_prevue", reponse.data["erreurs"])

    def test_dates_obligatoires_pour_une_permission(self):
        reponse = self._poster({
            "type_absence": "PERMISSION", "motif": "Famille", "lieu_jouissance": "Antananarivo",
        })
        self.assertEqual(reponse.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("date_debut", reponse.data["erreurs"])
        self.assertIn("date_fin", reponse.data["erreurs"])

    def test_motif_et_lieu_obligatoires(self):
        reponse = self._poster({
            "type_absence": "PERMISSION", "date_debut": "2026-03-02", "date_fin": "2026-03-03",
        })
        self.assertEqual(reponse.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("motif", reponse.data["erreurs"])
        self.assertIn("lieu_jouissance", reponse.data["erreurs"])

    def test_champ_inconnu_refuse_au_lieu_d_etre_ignore(self):
        reponse = self._poster({
            "type_absence": "PERMISSION", "motif": "Famille", "lieu_jouissance": "Tana",
            "date_debut": "2026-03-02", "date_fin": "2026-03-03", "adresse_conge": "Lot 12",
        })
        self.assertEqual(reponse.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("adresse_conge", reponse.data["erreurs"])

    def test_url_du_justificatif_est_telechargeable(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.connecter(self.compte_agent)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "type_absence": "MISSION", "motif": "Ordre de mission", "lieu_jouissance": "Toamasina",
                "date_debut": "2026-03-02", "date_fin": "2026-03-04",
                "fichier_justificatif": SimpleUploadedFile("ordre.pdf", b"%PDF-1.4 test"),
            },
            format="multipart",
        )
        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        telechargement = self.client.get(reponse.data["justificatif_url"])
        self.assertEqual(telechargement.status_code, status.HTTP_200_OK)


class ScanDecisionAPITests(BaseAPICase):
    """La vue de scan retrouve l'agent par son IM, même enregistré avec des espaces."""

    def _pdf_decision(self, numero="2205", im="123456"):
        import io

        from reportlab.pdfgen import canvas

        flux = io.BytesIO()
        c = canvas.Canvas(flux)
        y = 800
        for ligne in (
            f"DECISION N° {numero} MEN/SG/DRH",
            f"IM : {im}  Indice 1250",
            "un conge de 30 jours au titre de l'annee 2026",
            "Budget General, Imputation 2.1.1, signature de la direction",
        ):
            c.drawString(60, y, ligne)
            y -= 30
        c.save()
        return SimpleUploadedFile("decision.pdf", flux.getvalue())

    def test_agent_retrouve_malgre_les_espaces_dans_l_im(self):
        titulaire = Personnel.objects.create(
            im="123 456", cin="CINSCAN1", direction=self.direction, service=self.service,
            nom="RAKOTO", prenoms="Jean", sexe="M", date_naissance=date(1985, 5, 5),
            statut=Statut.FONCTIONNAIRE,
        )
        self.connecter(self.compte_rh)
        reponse = self.client.post("/api/decisions/scan/", {"fichier": self._pdf_decision()})
        self.assertEqual(reponse.status_code, status.HTTP_200_OK, reponse.data)
        self.assertEqual(reponse.data["donnees_extraites"]["annees"], [2026])
        self.assertEqual(reponse.data["agent"]["id_personnel"], titulaire.pk)
        self.assertFalse(reponse.data["numero_deja_utilise"])

    def test_numero_deja_utilise_signale(self):
        from unittest.mock import patch

        DecisionConge.objects.create(
            numero_decision="2205", personnel=self.agent, direction=self.direction,
            annees_titre="2025", date_emission=date(2025, 1, 5),
        )
        self.connecter(self.compte_rh)

        # Le numéro du titre « DECISION N° ... » n'est pas une preuve du numéro
        # tamponné. On simule ici un OCR qui a effectivement reconnu le cachet,
        # afin de tester indépendamment le contrôle de doublon de l'API.
        extraction_ocr = {
            "source": "OCR",
            "im": "123456",
            "numero_decision": "2205",
            "annees": [2026],
            "agent_concerne": "",
            "champs_complementaires_manquants": [],
            "avertissements": [],
        }
        with patch(
            "conges.services.ocr.extraire_donnees_decision",
            return_value=extraction_ocr,
        ):
            reponse = self.client.post(
                "/api/decisions/scan/", {"fichier": self._pdf_decision()}
            )

        self.assertEqual(reponse.status_code, status.HTTP_200_OK, reponse.data)
        self.assertEqual(reponse.data["donnees_extraites"]["numero_decision"], "2205")
        self.assertTrue(reponse.data["numero_deja_utilise"])


class FormulairePdfRemplissageTests(BaseAPICase):
    """Soulignement du type d'absence et emplacement des valeurs sur le formulaire officiel."""

    def _formulaire(self, type_absence, **plus):
        self.connecter(self.compte_agent)
        corps = {
            "type_absence": type_absence, "motif": "Repos", "lieu_jouissance": "Fianarantsoa",
            "date_debut": "2026-03-02", "date_fin": "2026-03-03",
        }
        corps.update(plus)
        corps.setdefault("signature_agent", SIGNATURE_TEST_DATA_URI)
        reponse = self.client.post("/api/demandes/", corps, format="json")
        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        pdf = self.client.get(f"/api/demandes/{reponse.data['id_demande']}/formulaire/")
        self.assertEqual(pdf.status_code, status.HTTP_200_OK)
        return b"".join(pdf.streaming_content), reponse.data

    def test_signature_de_la_demande_est_integree_au_pdf_officiel(self):
        contenu, donnees = self._formulaire("PERMISSION")
        lecteur = PdfReader(BytesIO(contenu))
        ressources = lecteur.pages[0]["/Resources"].get_object()
        objets = ressources.get("/XObject")
        if objets is None:
            self.fail("Le PDF devrait contenir les images du formulaire et de la signature.")
        images = [
            objet.get_object() for objet in objets.get_object().values()
            if objet.get_object().get("/Subtype") == "/Image"
        ]
        self.assertGreaterEqual(len(images), 2, f"La signature de la demande {donnees['id_demande']} n'a pas été incorporée au PDF.")

    def test_pdf_est_scelle_hash_et_journal_sont_verifiables(self):
        contenu, donnees = self._formulaire("PERMISSION")
        demande = DemandeAbsence.objects.get(pk=donnees["id_demande"])

        self.assertTrue(demande.pdf_officiel)
        self.assertEqual(demande.pdf_officiel_sha256, hashlib.sha256(contenu).hexdigest())
        self.assertIsNotNone(demande.pdf_officiel_genere_le)
        self.assertEqual(demande.pdf_officiel_genere_par, self.compte_agent)

        evenements = list(
            demande.traces_signature.order_by("id_trace").values_list("evenement", flat=True)
        )
        self.assertEqual(
            evenements,
            [
                TraceSignature.Evenement.SIGNATURE_AGENT_ENREGISTREE,
                TraceSignature.Evenement.PDF_OFFICIEL_SCELE,
                TraceSignature.Evenement.PDF_OFFICIEL_TELECHARGE,
            ],
        )

        verification = self.client.get(f"/api/demandes/{demande.pk}/integrite/")
        self.assertEqual(verification.status_code, status.HTTP_200_OK, verification.data)
        self.assertTrue(verification.data["signature_integrite"])
        self.assertTrue(verification.data["document_integrite"])
        self.assertTrue(verification.data["journal_integrite"])
        self.assertTrue(verification.data["integrite_globale"])
        self.assertEqual(len(verification.data["historique"]), 3)

        seconde_reponse = self.client.get(f"/api/demandes/{demande.pk}/formulaire/")
        self.assertEqual(seconde_reponse.status_code, status.HTTP_200_OK)
        second_pdf = b"".join(seconde_reponse.streaming_content)
        self.assertEqual(second_pdf, contenu, "Le PDF scellé doit rester identique aux téléchargements suivants.")
        self.assertEqual(
            demande.traces_signature.filter(
                evenement=TraceSignature.Evenement.PDF_OFFICIEL_SCELE
            ).count(),
            1,
        )

    def test_telechargement_refuse_un_pdf_modifie(self):
        _, donnees = self._formulaire("PERMISSION")
        demande = DemandeAbsence.objects.get(pk=donnees["id_demande"])
        stockage = demande.pdf_officiel.storage
        nom_stockage = demande.pdf_officiel.name
        stockage.delete(nom_stockage)
        nom_corrompu = stockage.save(nom_stockage, ContentFile(b"contenu modifie volontairement"))
        try:
            reponse = self.client.get(f"/api/demandes/{demande.pk}/formulaire/")
            self.assertEqual(reponse.status_code, 409, getattr(reponse, "data", None))
        finally:
            stockage.delete(nom_corrompu)

    def test_les_traces_de_signature_sont_non_modifiables(self):
        _, donnees = self._formulaire("PERMISSION")
        demande = DemandeAbsence.objects.get(pk=donnees["id_demande"])
        trace = demande.traces_signature.first()
        self.assertIsNotNone(trace)
        with self.assertRaises(Exception):
            trace.save()
        with self.assertRaises(Exception):
            TraceSignature.objects.filter(pk=trace.pk).update(acteur_identifiant="modifie")
        with self.assertRaises(Exception):
            trace.delete()

    def test_permission_soulignee(self):
        contenu, _ = self._formulaire("PERMISSION")
        traits = traits_du_bloc_type(contenu)
        self.assertEqual(len(traits), 1, traits)
        x0, x1, haut = traits[0]
        self.assertAlmostEqual(haut, 186.6, delta=1.5)  # sous « PERMISSION »
        self.assertAlmostEqual(x1, 460.2, delta=1.5)

    def test_annonces_refusent_la_generation_de_fiche_officielle(self):
        """Les annonces n'utilisent pas le formulaire PDF officiel MEN."""
        self.connecter(self.compte_agent)
        types_annonce = ("MISSION", "MATERNITE", "PATERNITE", "REPOS_SANITAIRE")

        for type_absence in types_annonce:
            with self.subTest(type_absence=type_absence):
                demande = DemandeAbsence.objects.create(
                    personnel=self.agent,
                    type_absence=type_absence,
                    motif="Annonce de test",
                    date_debut=date(2026, 10, 21),
                    date_fin=date(2026, 10, 22),
                    nombre_jours=2,
                    lieu_jouissance="Antananarivo",
                )
                reponse = self.client.get(f"/api/demandes/{demande.pk}/formulaire/")
                self.assertEqual(reponse.status_code, status.HTTP_400_BAD_REQUEST, reponse.data)
                self.assertIn("type_absence", reponse.data.get("erreurs", reponse.data))

    def test_valeurs_sur_les_bonnes_lignes(self):
        contenu, donnees = self._formulaire("PERMISSION")
        with pdfplumber.open(BytesIO(contenu)) as pdf:
            mots = pdf.pages[0].extract_words()

        def haut_de(texte, x_min=0, x_max=600):
            return next(m["top"] for m in mots if m["text"] == texte and x_min < m["x0"] < x_max)

        # Le nombre de jours (2) est sur la ligne « NOMBRE DE JOURS DEMANDES », au-dessus du DU/AU.
        jours = haut_de("2", 250, 380)
        self.assertLess(jours, haut_de("02/03/2026"))
        # Le motif est sur sa propre ligne, sous les dates.
        self.assertGreater(haut_de("Repos"), haut_de("02/03/2026"))
        # Le corps d'appartenance commence après son libellé, pas au bord de la page.
        corps = self.agent.corps
        premier_mot = corps.split()[0]
        self.assertLess(haut_de(premier_mot, 330, 420) - haut_de(self.agent.im), 3)

    def test_zone_numero_officiel_reste_vide_et_date_demande_est_ecrite(self):
        contenu, donnees = self._formulaire("PERMISSION")
        with pdfplumber.open(BytesIO(contenu)) as pdf:
            texte = pdf.pages[0].extract_text() or ""
        numero_ordre = donnees["numero_enregistrement"].rsplit("-", 1)[-1]
        # Le numéro d'enregistrement reste une donnée interne, mais ne doit pas
        # être imprimé dans la zone « N° 2026-.....-MEN/SG/DSI » du PDF officiel.
        self.assertNotIn(numero_ordre, texte)
        self.assertIn(date.today().strftime("%d/%m/%Y"), texte)


class CircuitRHChefServiceTests(BaseAPICase):
    """Le compte RH face au circuit de visa : jamais de refus trompeur, messages précis."""

    def _demande(self, compte):
        self.connecter(compte)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "signature_agent": SIGNATURE_TEST_DATA_URI,
                "type_absence": "PERMISSION", "motif": "Famille", "lieu_jouissance": "Antananarivo",
                "date_debut": "2026-03-02", "date_fin": "2026-03-03",
            },
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        return reponse.data["id_demande"]

    def test_rh_sans_service_a_des_files_vides_et_non_une_erreur(self):
        self.connecter(self.compte_rh)  # la RH de la base de test n'a aucun service
        for url in ("/api/demandes/en-attente-service/", "/api/a-valider/"):
            reponse = self.client.get(url)
            self.assertEqual(reponse.status_code, status.HTTP_200_OK, (url, reponse.data))
            self.assertEqual(reponse.data, [])

    def test_chef_sans_service_recoit_un_message_precis(self):
        self.chef.service = None
        self.chef.save()
        self.connecter(self.compte_chef)
        for url in ("/api/demandes/en-attente-service/", "/api/a-valider/"):
            reponse = self.client.get(url)
            self.assertEqual(reponse.status_code, status.HTTP_403_FORBIDDEN)
            self.assertIn("aucun service", reponse.data["detail"])

    def test_rh_sans_service_ne_peut_pas_viser_et_comprend_pourquoi(self):
        id_demande = self._demande(self.compte_agent)
        self.connecter(self.compte_rh)
        reponse = self.client.post(
            f"/api/demandes/{id_demande}/avis/",
            {"avis": "FAVORABLE", "observation": "ok"}, format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("aucun service", reponse.data["detail"])

    def test_demande_de_la_rh_va_au_directeur_pas_au_chef(self):
        self.rh.service = self.service
        self.rh.save()
        id_demande = self._demande(self.compte_rh)

        # Le chef du même service ne la voit pas dans sa file et ne peut pas la viser.
        self.connecter(self.compte_chef)
        self.assertEqual(self.client.get("/api/demandes/en-attente-service/").data, [])
        refus = self.client.post(
            f"/api/demandes/{id_demande}/avis/",
            {"avis": "FAVORABLE", "observation": "ok"}, format="json",
        )
        self.assertEqual(refus.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("responsable RH", refus.data["detail"])

        # Le directeur la voit et la décide directement (RG-10).
        self.connecter(self.compte_directeur)
        file_directeur = self.client.get("/api/demandes/en-attente-direction/")
        self.assertIn(id_demande, [d["id_demande"] for d in file_directeur.data])
        decision = self.client.post(
            f"/api/demandes/{id_demande}/avis/",
            {"avis": "FAVORABLE", "observation": "ok"}, format="json",
        )
        self.assertEqual(decision.status_code, status.HTTP_200_OK, decision.data)
        self.assertEqual(decision.data["statut_demande"], "VALIDE_DIR")

    def test_rh_rattachee_a_un_service_vise_les_demandes_de_son_service(self):
        self.rh.service = self.service
        self.rh.save()
        id_demande = self._demande(self.compte_agent)
        self.connecter(self.compte_rh)
        file_rh = self.client.get("/api/a-valider/")
        self.assertEqual([d["id_demande"] for d in file_rh.data], [id_demande])
        reponse = self.client.post(
            f"/api/demandes/{id_demande}/avis/",
            {"avis": "FAVORABLE", "observation": "ok"}, format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_200_OK, reponse.data)
        self.assertEqual(reponse.data["statut_demande"], "APPROUVE_CS")
