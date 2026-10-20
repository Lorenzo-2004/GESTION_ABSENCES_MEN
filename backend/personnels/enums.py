"""Énumérations métier du domaine « personnels » (CDC §2 et §3.1)."""

from django.db import models


class Statut(models.TextChoices):
    """Statut administratif de l'agent (CDC §3.1, colonne « Public Éligible »)."""

    FONCTIONNAIRE = "FONCTIONNAIRE", "Fonctionnaire"
    ECD = "ECD", "Agent non encadré de l'État (ECD)"
    STAGIAIRE = "STAGIAIRE", "Stagiaire"


class Sexe(models.TextChoices):
    MASCULIN = "M", "Masculin"
    FEMININ = "F", "Féminin"


class Role(models.TextChoices):
    """Rôle applicatif porté par le compte système (matrice RBAC, CDC §2)."""

    AGENT = "ROLE_AGENT", "Agent"
    CHEF_SERVICE = "ROLE_CHEF_SERVICE", "Chef de service"
    DIRECTEUR = "ROLE_DIRECTEUR", "Directeur"
    RH = "ROLE_RH", "Ressources humaines"
    ADMIN = "ROLE_ADMIN", "Administrateur"
