from datetime import date

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from organisation.models import Direction, Service
from personnels.models import Personnel, Role, Statut, Utilisateur

from .models import (
    Avis, DecisionConge, DemandeAbsence, SoldeConge, StatutDemande,
    TypeAbsence, ValidationWorkflow,
)

_compteur = 0


def mk_personnel(direction, service=None, role=None, statut=Statut.FONCTIONNAIRE, sexe="M", **kw):
    global _compteur
    _compteur += 1
    p = Personnel.objects.create(
        im=f"IM{_compteur:05d}", cin=f"CIN{_compteur:09d}", direction=direction, service=service,
        nom=f"NOM{_compteur}", prenoms="Test", sexe=sexe, date_naissance=date(1990, 1, 1),
        statut=statut, **kw,
    )
    if role:
        Utilisateur.objects.create_user(username=f"u{_compteur}", password="x12345678", role=role, personnel=p)
    return p


def activer(personnel, annees="2026"):
    d = DecisionConge.objects.create(
        numero_decision=f"DEC-{personnel.im}-{annees}", personnel=personnel, direction=personnel.direction,
        annees_titre=annees, date_emission=date(2026, 1, 5),
    )
    d.valider_et_activer_par_rh()
    return d


def demande(personnel, type_absence, debut, fin, **kw):
    return DemandeAbsence(personnel=personnel, type_absence=type_absence, date_debut=debut, date_fin=fin, **kw)


class BaseCase(TestCase):
    def setUp(self):
        self.dir = Direction.objects.create(code_direction="DRH", nom_direction="DRH")
        self.svc = Service.objects.create(code_service="S1", nom_service="Service 1", direction=self.dir)
        self.svc2 = Service.objects.create(code_service="S2", nom_service="Service 2", direction=self.dir)
        self.agent = mk_personnel(self.dir, self.svc, Role.AGENT)
        self.chef = mk_personnel(self.dir, self.svc, Role.CHEF_SERVICE)
        self.chef2 = mk_personnel(self.dir, self.svc2, Role.CHEF_SERVICE)
        self.directeur = mk_personnel(self.dir, None, Role.DIRECTEUR)


class SoldeEtDecisionTests(BaseCase):
    def test_activation_cree_solde_30(self):
        activer(self.agent)
        s = self.agent.get_solde_actif(2026)
        self.assertEqual((s.droit_annuel, s.jours_pris, s.solde_restant), (30, 0, 30))

    def test_activation_nouvelle_annee_reporte_reliquat_precedent(self):
        """L'activation d'une nouvelle année reprend le reliquat précédent."""

        SoldeConge.objects.create(
            personnel=self.agent,
            annee=2025,
            droit_annuel=30,
            jours_pris=10,
        )

        # La RH active les droits de 2026.
        activer(self.agent, annees="2026")

        solde_2026 = SoldeConge.objects.get(
            personnel=self.agent,
            annee=2026,
        )

        self.assertEqual(solde_2026.droit_annuel, 30)
        self.assertEqual(solde_2026.report_anterieur, 20)
        self.assertEqual(solde_2026.solde_restant, 50)

    def test_report_actualise_solde_existant_sans_perdre_jours_pris(self):
        """Le report actualise le solde existant sans effacer les jours pris."""
        from .services.soldes import reporter_reliquats

        SoldeConge.objects.create(
            personnel=self.agent,
            annee=2025,
            droit_annuel=30,
            jours_pris=10,
        )

        # Le solde 2026 existe déjà et l'agent a consommé 7 jours.
        solde_2026 = SoldeConge.objects.create(
            personnel=self.agent,
            annee=2026,
            droit_annuel=30,
            report_anterieur=5,
            jours_pris=7,
        )

        # Le reliquat 2025 doit remplacer l'ancien report de 5 jours.
        reporter_reliquats(2025)

        solde_2026.refresh_from_db()

        self.assertEqual(solde_2026.droit_annuel, 30)
        self.assertEqual(solde_2026.report_anterieur, 20)
        self.assertEqual(solde_2026.jours_pris, 7)
        self.assertEqual(solde_2026.solde_restant, 43)

        # Un second appel ne doit pas doubler le report.
        reporter_reliquats(2025)

        solde_2026.refresh_from_db()

        self.assertEqual(solde_2026.report_anterieur, 20)
        self.assertEqual(solde_2026.jours_pris, 7)
        self.assertEqual(solde_2026.solde_restant, 43)

    def test_reliquats_s_accumulent_sur_plusieurs_annees(self):
        """Les reliquats non consommés se cumulent d'une année à l'autre."""
        from .services.soldes import reporter_reliquats

        # 2024 : 30 jours de droits, 10 consommés, 20 restants.
        solde_2024 = SoldeConge.objects.create(
            personnel=self.agent,
            annee=2024,
            droit_annuel=30,
            jours_pris=10,
        )

        self.assertEqual(solde_2024.solde_restant, 20)

        # Report de 2024 vers 2025.
        reporter_reliquats(2024)

        solde_2025 = SoldeConge.objects.get(
            personnel=self.agent,
            annee=2025,
        )

        self.assertEqual(solde_2025.droit_annuel, 30)
        self.assertEqual(solde_2025.report_anterieur, 20)
        self.assertEqual(solde_2025.solde_restant, 50)

        # En 2025, 15 jours sont consommés : il en reste 35.
        solde_2025.jours_pris = 15
        solde_2025.save()

        self.assertEqual(solde_2025.solde_restant, 35)

        # Report de 2025 vers 2026.
        reporter_reliquats(2025)

        solde_2026 = SoldeConge.objects.get(
            personnel=self.agent,
            annee=2026,
        )

        self.assertEqual(solde_2026.droit_annuel, 30)
        self.assertEqual(solde_2026.report_anterieur, 35)
        self.assertEqual(solde_2026.solde_restant, 65)

    def test_activation_refusee_au_stagiaire(self):
        stag = mk_personnel(self.dir, self.svc, Role.AGENT, statut=Statut.STAGIAIRE)
        with self.assertRaises(ValidationError):
            activer(stag)
        self.assertEqual(SoldeConge.objects.filter(personnel=stag).count(), 0)

    def test_deduire_jours(self):
        activer(self.agent)
        s = self.agent.get_solde_actif(2026)
        s.deduire_jours(10)
        self.assertEqual((s.jours_pris, s.solde_restant), (10, 20))
        with self.assertRaises(ValidationError):
            s.deduire_jours(21)


class SoumissionTests(BaseCase):
    def test_stagiaire_conge_annuel_refuse_rg02(self):
        stag = mk_personnel(self.dir, self.svc, Role.AGENT, statut=Statut.STAGIAIRE)
        with self.assertRaises(ValidationError):
            demande(stag, TypeAbsence.CONGE_ANNUEL, date(2026, 3, 2), date(2026, 3, 6)).soumettre_demande()

    def test_stagiaire_peut_demander_permission(self):
        stag = mk_personnel(self.dir, self.svc, Role.AGENT, statut=Statut.STAGIAIRE)
        d = demande(stag, TypeAbsence.PERMISSION, date(2026, 3, 2), date(2026, 3, 3)).soumettre_demande()
        self.assertEqual(d.statut_demande, StatutDemande.EN_ATTENTE)
        self.assertTrue(d.numero_enregistrement.startswith("DA-"))

    def test_conge_annuel_sans_decision_refuse_rg04(self):
        with self.assertRaises(ValidationError):
            demande(
                self.agent,
                TypeAbsence.CONGE_ANNUEL,
                date(2026, 3, 2),
                date(2026, 3, 16),
            ).soumettre_demande()
    def test_conge_annuel_avec_decision_ok(self):
        activer(self.agent)
        d = demande(
            self.agent,
            TypeAbsence.CONGE_ANNUEL,
            date(2026, 3, 2),
            date(2026, 3, 16),
        ).soumettre_demande()

        self.assertEqual(d.nombre_jours, 15)

    def test_conge_annuel_ne_force_pas_une_premiere_tranche_de_15_jours(self):
        """Le cahier des charges ne prescrit pas de première tranche obligatoire de 15 jours."""
        activer(self.agent)

        premiere = demande(
            self.agent,
            TypeAbsence.CONGE_ANNUEL,
            date(2026, 3, 2),
            date(2026, 3, 15),
            annee_titre=2026,
        ).soumettre_demande()
        self.assertEqual(premiere.nombre_jours, 14)

        seconde = demande(
            self.agent,
            TypeAbsence.CONGE_ANNUEL,
            date(2026, 6, 1),
            date(2026, 6, 10),
            annee_titre=2026,
        ).soumettre_demande()
        self.assertEqual(seconde.nombre_jours, 10)

    def test_solde_insuffisant_en_comptant_les_demandes_en_attente(self):
        activer(self.agent)

        # Première demande : 15 jours.
        demande(
            self.agent,
            TypeAbsence.CONGE_ANNUEL,
            date(2026, 3, 1),
            date(2026, 3, 15),
        ).soumettre_demande()

        # Deuxième demande : 15 jours, le quota annuel est entièrement engagé.
        demande(
            self.agent,
            TypeAbsence.CONGE_ANNUEL,
            date(2026, 6, 1),
            date(2026, 6, 15),
        ).soumettre_demande()

        # Une journée supplémentaire doit être refusée.
        with self.assertRaises(ValidationError):
            demande(
                self.agent,
                TypeAbsence.CONGE_ANNUEL,
                date(2026, 9, 1),
                date(2026, 9, 1),
            ).soumettre_demande()
    def test_dates_incoherentes(self):
        with self.assertRaises(ValidationError):
            demande(self.agent, TypeAbsence.PERMISSION, date(2026, 3, 5), date(2026, 3, 1)).soumettre_demande()

    def test_plafond_permission_mensuel_rg01(self):
        with self.assertRaises(ValidationError):
            demande(self.agent, TypeAbsence.PERMISSION, date(2026, 3, 2), date(2026, 3, 5)).soumettre_demande()  # 4 j

    def test_plafond_cumule_sur_le_mois(self):
        demande(self.agent, TypeAbsence.PERMISSION, date(2026, 3, 2), date(2026, 3, 3)).soumettre_demande()  # 2 j
        with self.assertRaises(ValidationError):
            demande(self.agent, TypeAbsence.PERMISSION, date(2026, 3, 10), date(2026, 3, 11)).soumettre_demande()  # +2 > 3

    def test_plafond_reparti_sur_deux_mois(self):
        # 30 janv. -> 1er févr. = 3 jours : 2 en janvier + 1 en février, donc autorisé
        demande(self.agent, TypeAbsence.PERMISSION, date(2026, 1, 30), date(2026, 2, 1)).soumettre_demande()

    def test_plafond_autorisation_5_jours(self):
        demande(self.agent, TypeAbsence.AUTORISATION, date(2026, 3, 2), date(2026, 3, 6)).soumettre_demande()  # 5 j ok
        with self.assertRaises(ValidationError):
            demande(self.agent, TypeAbsence.AUTORISATION, date(2026, 3, 16), date(2026, 3, 16)).soumettre_demande()

    def test_demande_rejetee_ne_compte_pas_dans_le_plafond(self):
        d = demande(self.agent, TypeAbsence.PERMISSION, date(2026, 3, 2), date(2026, 3, 4)).soumettre_demande()
        d.statut_demande = StatutDemande.REJETE
        d.save()
        demande(self.agent, TypeAbsence.PERMISSION, date(2026, 3, 10), date(2026, 3, 12)).soumettre_demande()

    def test_justificatif_obligatoire_rg08(self):
        with self.assertRaises(ValidationError):
            demande(self.agent, TypeAbsence.MISSION, date(2026, 3, 2), date(2026, 3, 4)).soumettre_demande()
        fichier = SimpleUploadedFile("ordre.pdf", b"%PDF-1.4 test")
        d = demande(self.agent, TypeAbsence.MISSION, date(2026, 3, 2), date(2026, 3, 4), fichier_justificatif=fichier)
        d.soumettre_demande()

    def test_maternite_reservee_aux_meres(self):
        fichier = SimpleUploadedFile("certif.pdf", b"%PDF-1.4 test")
        with self.assertRaises(ValidationError):
            demande(self.agent, TypeAbsence.MATERNITE, date(2026, 3, 2), date(2026, 3, 10), fichier_justificatif=fichier).soumettre_demande()
        mere = mk_personnel(self.dir, self.svc, Role.AGENT, sexe="F")
        fichier2 = SimpleUploadedFile("certif2.pdf", b"%PDF-1.4 test")
        # Le compteur maternité est fixe à 90 jours calendaires (RG-14).
        demande(
            mere,
            TypeAbsence.MATERNITE,
            date(2026, 3, 2),
            date(2026, 5, 30),
            date_evenement_prevue=date(2026, 4, 1),
            fichier_justificatif=fichier2,
        ).soumettre_demande()

    def test_paternite_duree_max_15_jours(self):
        fichier = SimpleUploadedFile("acte.pdf", b"%PDF-1.4 test")
        with self.assertRaises(ValidationError):
            demande(
                self.agent, TypeAbsence.PATERNITE, date(2026, 3, 1), date(2026, 3, 20),
                date_evenement_prevue=date(2026, 3, 15), fichier_justificatif=fichier,
            ).soumettre_demande()

    def test_maternite_duree_fixe_90_jours(self):
        mere = mk_personnel(self.dir, self.svc, Role.AGENT, sexe="F")
        fichier = SimpleUploadedFile("certificat.pdf", b"%PDF-1.4 test")
        with self.assertRaises(ValidationError):
            demande(
                mere, TypeAbsence.MATERNITE, date(2026, 3, 2), date(2026, 3, 10),
                date_evenement_prevue=date(2026, 4, 1), fichier_justificatif=fichier,
            ).soumettre_demande()

    def test_paternite_duree_fixe_15_jours(self):
        fichier = SimpleUploadedFile("acte.pdf", b"%PDF-1.4 test")
        with self.assertRaises(ValidationError):
            demande(
                self.agent, TypeAbsence.PATERNITE, date(2026, 3, 1), date(2026, 3, 14),
                date_evenement_prevue=date(2026, 3, 15), fichier_justificatif=fichier,
            ).soumettre_demande()


@override_settings(MEN_APPLIQUER_DELAIS_REGLEMENTAIRES=True)
class DelaisDepotTests(BaseCase):
    """Tests des délais RG-11 sur des dates fixes et indépendantes de l'horloge."""

    def test_conge_annuel_doit_etre_depose_entre_14_et_30_jours(self):
        from .services.demandes import verifier_delai_de_depot

        conforme = demande(
            self.agent, TypeAbsence.CONGE_ANNUEL,
            date(2026, 2, 15), date(2026, 2, 28), annee_titre=2026,
        )
        verifier_delai_de_depot(conforme, aujourdhui=date(2026, 2, 1))

        trop_tard = demande(
            self.agent, TypeAbsence.CONGE_ANNUEL,
            date(2026, 2, 10), date(2026, 2, 20), annee_titre=2026,
        )
        with self.assertRaises(ValidationError):
            verifier_delai_de_depot(trop_tard, aujourdhui=date(2026, 2, 1))

        trop_tot = demande(
            self.agent, TypeAbsence.CONGE_ANNUEL,
            date(2026, 3, 4), date(2026, 3, 10), annee_titre=2026,
        )
        with self.assertRaises(ValidationError):
            verifier_delai_de_depot(trop_tot, aujourdhui=date(2026, 2, 1))

    def test_mission_doit_etre_deposee_au_moins_7_jours_avant(self):
        from .services.demandes import verifier_delai_de_depot

        conforme = demande(
            self.agent, TypeAbsence.MISSION,
            date(2026, 2, 8), date(2026, 2, 10),
        )
        verifier_delai_de_depot(conforme, aujourdhui=date(2026, 2, 1))

        trop_tard = demande(
            self.agent, TypeAbsence.MISSION,
            date(2026, 2, 7), date(2026, 2, 9),
        )
        with self.assertRaises(ValidationError):
            verifier_delai_de_depot(trop_tard, aujourdhui=date(2026, 2, 1))

    def test_maternite_et_paternite_utilisent_la_date_evenement_prevue(self):
        from .services.demandes import verifier_delai_de_depot

        maternite = demande(
            self.agent, TypeAbsence.MATERNITE,
            date(2026, 3, 1), date(2026, 5, 29),
            date_evenement_prevue=date(2026, 3, 1),
        )
        # L'agent du setUp est masculin; ici on vérifie uniquement le délai RG-11.
        verifier_delai_de_depot(maternite, aujourdhui=date(2026, 2, 1))

        paternite = demande(
            self.agent, TypeAbsence.PATERNITE,
            date(2026, 2, 15), date(2026, 3, 1),
            date_evenement_prevue=date(2026, 2, 15),
        )
        verifier_delai_de_depot(paternite, aujourdhui=date(2026, 2, 1))

        sans_evenement = demande(
            self.agent, TypeAbsence.PATERNITE,
            date(2026, 2, 15), date(2026, 3, 1),
        )
        with self.assertRaises(ValidationError):
            verifier_delai_de_depot(sans_evenement, aujourdhui=date(2026, 2, 1))


class CircuitValidationTests(BaseCase):
    def _conge_annuel(
        self,
        personnel,
        debut=date(2026, 3, 2),
        fin=date(2026, 3, 16),
    ):
        return demande(
            personnel,
            TypeAbsence.CONGE_ANNUEL,
            debut,
            fin,
        ).soumettre_demande()
    def test_circuit_complet_et_decompte_rg03(self):
        activer(self.agent)
        d = self._conge_annuel(self.agent)  # 10 j
        ValidationWorkflow.enregistrer_avis(d, self.chef, Avis.FAVORABLE)
        d.refresh_from_db()
        self.assertEqual(d.statut_demande, StatutDemande.APPROUVE_CS)
        self.assertEqual(self.agent.get_solde_actif(2026).jours_pris, 15)
        ValidationWorkflow.enregistrer_avis(d, self.directeur, Avis.FAVORABLE)
        d.refresh_from_db()
        self.assertEqual(d.statut_demande, StatutDemande.VALIDE_DIR)
        s = self.agent.get_solde_actif(2026)
        self.assertEqual((s.jours_pris, s.solde_restant), (15, 15))
        self.assertEqual(d.validations.count(), 2)

    def test_avis_defavorable_chef_rejette_sans_decompte(self):
        activer(self.agent)
        d = self._conge_annuel(self.agent)
        ValidationWorkflow.enregistrer_avis(d, self.chef, Avis.DEFAVORABLE)
        d.refresh_from_db()
        self.assertEqual(d.statut_demande, StatutDemande.REJETE)
        self.assertEqual(self.agent.get_solde_actif(2026).jours_pris, 0)

    def test_directeur_ne_peut_pas_annuler_validation_effective_du_chef_rg13(self):
        activer(self.agent)
        d = self._conge_annuel(self.agent)
        ValidationWorkflow.enregistrer_avis(d, self.chef, Avis.FAVORABLE)
        d.refresh_from_db()
        self.assertEqual(d.statut_demande, StatutDemande.APPROUVE_CS)
        self.assertEqual(self.agent.get_solde_actif(2026).jours_pris, 15)

        with self.assertRaises(ValidationError):
            ValidationWorkflow.enregistrer_avis(d, self.directeur, Avis.DEFAVORABLE)

        d.refresh_from_db()
        self.assertEqual(d.statut_demande, StatutDemande.APPROUVE_CS)
        self.assertEqual(self.agent.get_solde_actif(2026).jours_pris, 15)

    def test_permission_validee_ne_deduit_pas_le_solde(self):
        activer(self.agent)
        d = demande(self.agent, TypeAbsence.PERMISSION, date(2026, 3, 2), date(2026, 3, 3)).soumettre_demande()
        ValidationWorkflow.enregistrer_avis(d, self.chef, Avis.FAVORABLE, "Motif légitime")
        ValidationWorkflow.enregistrer_avis(d, self.directeur, Avis.FAVORABLE, "Accordé")
        self.assertEqual(self.agent.get_solde_actif(2026).jours_pris, 0)

    def test_observation_obligatoire_pour_les_faveurs_rg07(self):
        d = demande(self.agent, TypeAbsence.PERMISSION, date(2026, 3, 2), date(2026, 3, 3)).soumettre_demande()
        with self.assertRaises(ValidationError):
            ValidationWorkflow.enregistrer_avis(d, self.chef, Avis.FAVORABLE, "  ")

    def test_rh_est_aussi_chef_de_service_et_sa_demande_va_au_directeur(self):
        rh = mk_personnel(self.dir, self.svc, Role.RH)
        self.assertTrue(rh.est_chef_de_service)
        activer(rh)
        d = self._conge_annuel(rh)

        # La demande propre d'une RH ne doit pas passer par le visa de son service.
        with self.assertRaises(ValidationError):
            ValidationWorkflow.enregistrer_avis(d, self.chef, Avis.FAVORABLE)

        ValidationWorkflow.enregistrer_avis(d, self.directeur, Avis.FAVORABLE)
        d.refresh_from_db()
        self.assertEqual(d.statut_demande, StatutDemande.VALIDE_DIR)
        self.assertEqual(rh.get_solde_actif(2026).jours_pris, 15)

    def test_demande_chef_va_directement_au_directeur_rg10(self):
        activer(self.chef)
        d = self._conge_annuel(self.chef)
        with self.assertRaises(ValidationError):  # un autre chef ne peut pas la viser
            ValidationWorkflow.enregistrer_avis(d, self.chef2, Avis.FAVORABLE)
        ValidationWorkflow.enregistrer_avis(d, self.directeur, Avis.FAVORABLE)
        d.refresh_from_db()
        self.assertEqual(d.statut_demande, StatutDemande.VALIDE_DIR)
        self.assertEqual(self.chef.get_solde_actif(2026).jours_pris, 15)

    def test_chef_dun_autre_service_ne_peut_pas_viser(self):
        d = demande(self.agent, TypeAbsence.PERMISSION, date(2026, 3, 2), date(2026, 3, 3)).soumettre_demande()
        with self.assertRaises(ValidationError):
            ValidationWorkflow.enregistrer_avis(d, self.chef2, Avis.FAVORABLE, "ok")

    def test_directeur_ne_peut_pas_court_circuiter_le_chef(self):
        d = demande(self.agent, TypeAbsence.PERMISSION, date(2026, 3, 2), date(2026, 3, 3)).soumettre_demande()
        with self.assertRaises(ValidationError):  # encore EN_ATTENTE de visa
            ValidationWorkflow.enregistrer_avis(d, self.directeur, Avis.FAVORABLE, "ok")

    def test_agent_ne_peut_pas_valider(self):
        autre = mk_personnel(self.dir, self.svc, Role.AGENT)
        d = demande(autre, TypeAbsence.PERMISSION, date(2026, 3, 2), date(2026, 3, 3)).soumettre_demande()
        with self.assertRaises(ValidationError):
            ValidationWorkflow.enregistrer_avis(d, self.agent, Avis.FAVORABLE, "ok")

    def test_on_ne_valide_pas_sa_propre_demande(self):
        d = demande(self.chef, TypeAbsence.PERMISSION, date(2026, 3, 2), date(2026, 3, 3)).soumettre_demande()
        with self.assertRaises(ValidationError):
            ValidationWorkflow.enregistrer_avis(d, self.chef, Avis.FAVORABLE, "ok")

    def test_double_validation_impossible(self):
        d = demande(self.agent, TypeAbsence.PERMISSION, date(2026, 3, 2), date(2026, 3, 3)).soumettre_demande()
        ValidationWorkflow.enregistrer_avis(d, self.chef, Avis.FAVORABLE, "ok")
        with self.assertRaises(ValidationError):
            ValidationWorkflow.enregistrer_avis(d, self.chef, Avis.FAVORABLE, "ok")
