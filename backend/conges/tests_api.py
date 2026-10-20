"""Tests de la couche API REST (CDC §5.1) : authentification, RBAC et règles métier."""

from datetime import date
from io import BytesIO

import pdfplumber
from django.core.files.uploadedfile import SimpleUploadedFile
from pypdf import PdfReader
from rest_framework import status
from rest_framework.test import APITestCase

from organisation.models import Direction, Service
from personnels.enums import Role, Statut
from personnels.models import Personnel, Utilisateur

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
    def test_agent_soumet_une_permission(self):
        self.connecter(self.compte_agent)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "type_absence": "PERMISSION",
                "date_debut": "2026-03-02",
                "date_fin": "2026-03-03",
            },
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        self.assertEqual(reponse.data["nombre_jours"], 2)
        self.assertEqual(reponse.data["statut_demande"], "EN_ATTENTE")
        self.assertTrue(reponse.data["numero_enregistrement"].startswith("DA-"))

    def test_api_refuse_permission_depassant_plafond_mensuel(self):
        self.connecter(self.compte_agent)

        reponse = self.client.post(
            "/api/demandes/",
            {
                "type_absence": "PERMISSION",
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
                "type_absence": "AUTORISATION",
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
                "type_absence": "AUTORISATION",
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
                "type_absence": "PERMISSION",
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
                "type_absence": "PERMISSION",
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
                "type_absence": "PERMISSION",
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
                "type_absence": "PERMISSION",
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
                "type_absence": "PERMISSION",
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
            {"type_absence": "CONGE_ANNUEL", "date_debut": "2026-03-02", "date_fin": "2026-03-06"},
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
                "type_absence": "CONGE_ANNUEL",
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
    
    def test_conge_annuel_20_jours_ne_compte_pas_sa_demande_deux_fois(self):
        """Une demande déjà enregistrée par la vue ne s'engage pas deux fois."""
        self.activer_agent(self.agent)
        self.connecter(self.compte_agent)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "type_absence": "CONGE_ANNUEL",
                "annee_titre": 2026,
                "date_debut": "2026-03-02",
                "date_fin": "2026-03-21",
                "motif": "Congé annuel demandé",
                "lieu_jouissance": "Antananarivo",
            },
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        self.assertEqual(reponse.data["nombre_jours"], 20)

    def test_annee_titre_choisie_utilisee_pour_solde_et_decompte(self):
        """Le congé est imputé à l'année choisie, même si les dates sont en 2026."""
        from .models import SoldeConge

        # La RH active uniquement les droits de 2025 pour cet agent.
        self.activer_agent(self.agent, annees="2025")

        self.connecter(self.compte_agent)
        reponse = self.client.post(
            "/api/demandes/",
            {
                "type_absence": "CONGE_ANNUEL",
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
        self.assertEqual((ressources_image[0]["/Width"], ressources_image[0]["/Height"]), (997, 1337))

        # Les libellés du formulaire sont une image scannée et ne sont pas extractibles.
        # On vérifie le calque texte ajouté par-dessus.
        self.assertIn(self.agent.im, texte)
        self.assertIn("15", texte)
        self.assertIn("02/03/2026", texte)
        self.assertIn("16/03/2026", texte)
        self.assertIn("15", texte)  # solde restant après la demande dans ce scénario
        self.assertIn("X", texte)  # coche superposée pour le congé annuel
        mots = pdf.pages[0].extract_words()
        haut_fin = next(item["top"] for item in mots if item["text"] == "16/03/2026")
        jours_corps = [
            item["top"] for item in mots
            if item["text"] == "15" and 180 < item["x0"] < 350
        ]
        self.assertTrue(jours_corps, "Nombre de jours demandé absent du corps du formulaire.")
        # Le nombre de jours du corps doit être après les champs DU/AU.
        self.assertGreater(jours_corps[0], haut_fin)

    def test_formulaire_pdf_coche_le_type_d_absence(self):
        """La case du type d'absence demandé est cochée."""
        demande_id = self._conge_annuel()  # congé annuel
        self.connecter(self.compte_agent)
        reponse = self.client.get(f"/api/demandes/{demande_id}/formulaire/")
        contenu = b"".join(reponse.streaming_content)

        with pdfplumber.open(BytesIO(contenu)) as pdf:
            texte = pdf.pages[0].extract_text() or ""

        # Le libellé « CONGE » est dans l'image scannée, mais la coche est un calque texte.
        self.assertIn("X", texte)
        page = PdfReader(BytesIO(contenu)).pages[0]
        image_xobjects = [
            obj.get_object()
            for obj in page["/Resources"].get_object()["/XObject"].values()
            if obj.get_object().get("/Subtype") == "/Image"
        ]
        self.assertEqual(len(image_xobjects), 1)
        self.assertEqual((image_xobjects[0]["/Width"], image_xobjects[0]["/Height"]), (997, 1337))
        mots = pdfplumber.open(BytesIO(contenu)).pages[0].extract_words()
        # La coche doit être dans la rangée de CONGE, pas dans l'en-tête.
        croix = next(item for item in mots if item["text"] == "X")
        self.assertLess(croix["top"], 200)

    def test_formulaire_pdf_affiche_annee_titre_choisie(self):
        """Le PDF affiche l'année choisie, indépendamment des dates du congé."""
        self.activer_agent(self.agent, annees="2025")
        self.connecter(self.compte_agent)

        reponse = self.client.post(
            "/api/demandes/",
            {
                "type_absence": "CONGE_ANNUEL",
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
            },
            format="json",
        )
        self.assertEqual(creation.status_code, status.HTTP_201_CREATED)
        reponse = self.client.post(
            f"/api/decisions/{creation.data['id_decision']}/confirmer/", format="json"
        )
        self.assertEqual(reponse.status_code, status.HTTP_200_OK)
        self.assertTrue(reponse.data["est_valide"])

    def _demande_permission(self, personnel_compte):
        self.connecter(personnel_compte)
        reponse = self.client.post(
            "/api/demandes/",
            {"type_absence": "PERMISSION", "date_debut": "2026-05-04", "date_fin": "2026-05-05"},
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
                "type_absence": "CONGE_ANNUEL",
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
                "personnel": self.agent.pk, "type_absence": "PERMISSION",
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
                "personnel": etranger.pk, "type_absence": "PERMISSION",
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
                "personnel": autre.pk, "type_absence": "PERMISSION",
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
