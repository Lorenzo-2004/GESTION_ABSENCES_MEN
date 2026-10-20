"""Personnel du ministère et compte système (CDC §2, §3.1 et §5.2)."""

from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from organisation.models import Direction, Service

from .enums import Role, Sexe, Statut

__all__ = ["Personnel", "Role", "Sexe", "Statut", "Utilisateur"]


class Personnel(models.Model):
    """Agent (Fonctionnaire, ECD ou Stagiaire) rattaché à une direction et un service."""

    id_personnel = models.BigAutoField(primary_key=True)
    im = models.CharField("Indice matricule", max_length=20, unique=True)
    cin = models.CharField(max_length=20, unique=True)
    direction = models.ForeignKey(
        Direction,
        on_delete=models.PROTECT,
        related_name="personnels",
        db_column="id_direction",
    )
    service = models.ForeignKey(
        Service,
        on_delete=models.PROTECT,
        related_name="personnels",
        db_column="id_service",
        null=True,
        blank=True,
    )
    nom = models.CharField(max_length=100)
    prenoms = models.CharField(max_length=150, blank=True)
    sexe = models.CharField(max_length=1, choices=Sexe.choices)
    date_naissance = models.DateField()
    telephone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    statut = models.CharField(max_length=15, choices=Statut.choices)
    corps = models.CharField(max_length=100, blank=True)
    grade = models.CharField(max_length=100, blank=True)
    check_presence = models.BooleanField(default=True)

    class Meta:
        db_table = "personnels"
        ordering = ["nom", "prenoms"]
        indexes = [
            models.Index(fields=["direction", "service"], name="idx_personnel_affectation"),
            models.Index(fields=["statut"], name="idx_personnel_statut"),
        ]

    def __str__(self):
        return f"{self.nom} {self.prenoms} ({self.im})".strip()

    def clean(self):
        # Le service choisi doit appartenir à la direction de l'agent.
        if self.service_id and self.service.direction_id != self.direction_id:
            raise ValidationError(
                {"service": "Ce service n'appartient pas à la direction choisie."}
            )

    def save(self, *args, **kwargs):
        # clean() n'est pas appelé par save() : on l'impose pour que l'invariant
        # « service ∈ direction » tienne aussi hors formulaires (shell, API, import).
        self.clean()
        super().save(*args, **kwargs)

    @property
    def nom_complet(self):
        return f"{self.nom} {self.prenoms}".strip()

    @property
    def est_stagiaire(self):
        return self.statut == Statut.STAGIAIRE

    @property
    def est_eligible_conge_annuel(self):
        """RG-02 : les stagiaires n'ont aucun droit au congé annuel."""
        return not self.est_stagiaire

    @property
    def est_chef_de_service(self):
        """Chef de service opérationnel : les comptes RH dirigent aussi le service RH."""
        compte = getattr(self, "compte", None)
        return compte is not None and compte.role in (Role.CHEF_SERVICE, Role.RH)

    def get_solde_actif(self, annee=None):
        """Solde de congé annuel de l'année donnée (année courante par défaut), ou None."""
        annee = annee or timezone.localdate().year
        return self.soldes.filter(annee=annee).first()

    def verifier_decision_annuelle(self, annee=None):
        """Vrai si la RH a enregistré une décision de congé valide couvrant l'année (RG-04)."""
        annee = annee or timezone.localdate().year
        return any(annee in d.annees() for d in self.decisions.filter(est_valide=True))


class Utilisateur(AbstractUser):
    """Compte système (RBAC). Lié à un Personnel, sauf l'administrateur technique."""

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.AGENT)
    personnel = models.OneToOneField(
        Personnel,
        on_delete=models.PROTECT,
        related_name="compte",
        null=True,
        blank=True,
    )

    class Meta:
        db_table = "utilisateurs"
        indexes = [models.Index(fields=["role"], name="idx_utilisateur_role")]

    def clean(self):
        super().clean()
        if self.role != Role.ADMIN and self.personnel_id is None:
            raise ValidationError(
                {"personnel": "Un compte non administrateur doit être lié à un personnel."}
            )

    def save(self, *args, **kwargs):
        # Un superuser créé en ligne de commande devient automatiquement administrateur MEN.
        if self.is_superuser and self.role == Role.AGENT:
            self.role = Role.ADMIN
        # Même raison que pour Personnel : l'invariant doit tenir hors formulaires.
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

    @property
    def est_valideur(self):
        """Chef de service, RH responsable de son service et directeur peuvent valider."""
        return self.role in (Role.CHEF_SERVICE, Role.RH, Role.DIRECTEUR)
