"""Tests de verrouillage de l'API des demandes : aucune modification ni suppression.

Une demande se crée, se consulte, se vise ou s'annule (action `annuler`). Les verbes
PUT, PATCH et DELETE doivent répondre 405, pour que ni l'agent ni le chef de service
ne puissent altérer une demande (dates, propriétaire) ou la supprimer sans recréditer
le solde.
"""

from rest_framework import status

from conges.models import DemandeAbsence
from conges.tests_api import BaseAPICase


class VerrouillageDemandesTests(BaseAPICase):
    def _creer_permission_agent(self):
        self.connecter(self.compte_agent)
        reponse = self.client.post(
            "/api/demandes/",
            {"type_absence": "PERMISSION", "date_debut": "2026-03-02", "date_fin": "2026-03-03"},
            format="json",
        )
        self.assertEqual(reponse.status_code, status.HTTP_201_CREATED, reponse.data)
        return reponse.data["id_demande"]

    def test_agent_ne_peut_ni_modifier_ni_supprimer(self):
        pk = self._creer_permission_agent()
        url = f"/api/demandes/{pk}/"

        self.assertEqual(
            self.client.patch(url, {"date_fin": "2026-03-30"}, format="json").status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(
            self.client.put(url, {}, format="json").status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(
            self.client.delete(url).status_code, status.HTTP_405_METHOD_NOT_ALLOWED
        )

        demande = DemandeAbsence.objects.get(pk=pk)
        self.assertEqual(str(demande.date_fin), "2026-03-03")
        self.assertEqual(demande.personnel_id, self.agent.pk)

    def test_demande_validee_reste_intacte(self):
        pk = self._creer_permission_agent()
        DemandeAbsence.objects.filter(pk=pk).update(statut_demande="VALIDE_DIR")
        url = f"/api/demandes/{pk}/"

        self.assertEqual(
            self.client.patch(url, {"date_fin": "2026-03-30"}, format="json").status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(
            self.client.delete(url).status_code, status.HTTP_405_METHOD_NOT_ALLOWED
        )
        self.assertTrue(DemandeAbsence.objects.filter(pk=pk).exists())

    def test_chef_ne_peut_ni_modifier_ni_supprimer_la_demande_dun_agent(self):
        pk = self._creer_permission_agent()
        self.connecter(self.compte_chef)
        url = f"/api/demandes/{pk}/"

        self.assertEqual(
            self.client.patch(url, {"date_fin": "2026-03-04"}, format="json").status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(
            self.client.delete(url).status_code, status.HTTP_405_METHOD_NOT_ALLOWED
        )
        self.assertTrue(DemandeAbsence.objects.filter(pk=pk).exists())

    def test_annulation_et_lecture_restent_possibles(self):
        pk = self._creer_permission_agent()

        lecture = self.client.get(f"/api/demandes/{pk}/")
        self.assertEqual(lecture.status_code, status.HTTP_200_OK)

        annulation = self.client.post(f"/api/demandes/{pk}/annuler/")
        self.assertEqual(annulation.status_code, status.HTTP_200_OK, annulation.data)
        self.assertEqual(annulation.data["statut_demande"], "REJETE")