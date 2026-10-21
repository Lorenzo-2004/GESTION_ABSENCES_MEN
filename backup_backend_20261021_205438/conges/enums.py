"""Énumérations métier du domaine « congés » (CDC §3.1 et §3.2)."""

from django.db import models


class TypeAbsence(models.TextChoices):
    """Typologie complète des absences (CDC §3.1)."""

    CONGE_ANNUEL = "CONGE_ANNUEL", "Congé annuel"
    PERMISSION = "PERMISSION", "Permission d'absence"
    AUTORISATION = "AUTORISATION", "Autorisation / Faveur"
    MISSION = "MISSION", "Ordre de mission"
    MATERNITE = "MATERNITE", "Congé de maternité"
    PATERNITE = "PATERNITE", "Congé de paternité"
    REPOS_SANITAIRE = "REPOS_SANITAIRE", "Repos sanitaire"


class StatutDemande(models.TextChoices):
    """États du diagramme d'activité (CDC §3.2, Phase 3)."""

    EN_ATTENTE = "EN_ATTENTE", "En attente"
    APPROUVE_CS = "APPROUVE_CS", "Approuvée par le chef de service"
    VALIDE_DIR = "VALIDE_DIR", "Validée par le directeur"
    REJETE = "REJETE", "Rejetée"
    ARCHIVEE = "ARCHIVEE", "Archivée"


class Niveau(models.TextChoices):
    CHEF_SERVICE = "CHEF_SERVICE", "Chef de service"
    DIRECTEUR = "DIRECTEUR", "Directeur"


class Avis(models.TextChoices):
    FAVORABLE = "FAVORABLE", "Favorable"
    DEFAVORABLE = "DEFAVORABLE", "Défavorable"


class NatureDecision(models.TextChoices):
    """Origine de l'enregistrement d'une décision de congé (CDC §3.2, Phase 1)."""

    OCR = "OCR", "Extraction OCR du scan"
    SAISIE_MANUELLE = "SAISIE_MANUELLE", "Saisie manuelle par la RH"
