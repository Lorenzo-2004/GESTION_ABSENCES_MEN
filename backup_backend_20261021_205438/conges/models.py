"""Modèles du domaine « congés » (CDC §5.2 et diagramme de classes).

Les méthodes exposées par le diagramme de classes (`soumettre_demande`,
`enregistrer_avis`, `valider_et_activer_par_rh`, `extraire_donnees_ocr`,
`generer_pdf_formulaire`) restent disponibles sur les modèles mais délèguent à la
couche `conges.services` : la logique métier n'est plus dupliquée ici.
"""

import re

from django.conf import settings
from django.db import models
from django.utils import timezone

from organisation.models import Direction
from personnels.enums import Sexe
from personnels.models import Personnel

from .enums import Avis, NatureDecision, Niveau, StatutDemande, TypeAbsence
from .regles import (
    DROIT_ANNUEL_DEFAUT,
    STATUTS_EN_COURS,
    annee_de_reference,
    iter_jours,
    nombre_jours_calendaires,
)

__all__ = [
    "Avis",
    "DecisionConge",
    "DemandeAbsence",
    "NatureDecision",
    "Niveau",
    "Sexe",
    "SoldeConge",
    "StatutDemande",
    "TraceSignature",
    "TypeAbsence",
    "ValidationWorkflow",
]


class SoldeConge(models.Model):
    """Quota annuel de congé annuel d'un agent, reliquats compris (CDC §1.2).

    `solde_restant = droit_annuel + report_anterieur - jours_pris`.
    """

    id_solde = models.BigAutoField(primary_key=True)
    personnel = models.ForeignKey(
        Personnel, on_delete=models.PROTECT, related_name="soldes", db_column="id_personnel"
    )
    annee = models.PositiveSmallIntegerField()
    droit_annuel = models.PositiveSmallIntegerField(default=DROIT_ANNUEL_DEFAUT)
    report_anterieur = models.PositiveSmallIntegerField(
        default=0, help_text="Reliquat de l'année précédente reporté sur cette année."
    )
    jours_pris = models.PositiveSmallIntegerField(default=0)
    solde_restant = models.SmallIntegerField(default=DROIT_ANNUEL_DEFAUT)

    class Meta:
        db_table = "soldes_conge"
        ordering = ["-annee"]
        constraints = [
            models.UniqueConstraint(
                fields=["personnel", "annee"], name="uniq_solde_personnel_annee"
            ),
            models.CheckConstraint(
                condition=models.Q(jours_pris__gte=0), name="chk_solde_jours_pris_positif"
            ),
        ]

    def __str__(self):
        return f"Solde {self.annee} de {self.personnel} : {self.solde_restant} j"

    def calculer_solde_restant(self):
        self.solde_restant = self.droit_annuel + self.report_anterieur - self.jours_pris
        return self.solde_restant

    def save(self, *args, **kwargs):
        self.calculer_solde_restant()
        super().save(*args, **kwargs)

    def jours_engages(self):
        """Jours immobilisés par des demandes encore en circuit (ni rejetées ni annulées)."""
        return self.personnel.demandes.jours_engages_conge_annuel(self.annee)

    def jours_disponibles(self):
        """Jours réellement mobilisables : solde restant diminué des demandes en circuit."""
        return self.solde_restant - self.jours_engages()

    def deduire_jours(self, nb_jours):
        """Débite le quota (RG-03). Lève ValidationError si le solde est insuffisant.

        Le reliquat modifié est aussitôt répercuté sur les années suivantes (report N → N+1).
        """
        from django.core.exceptions import ValidationError
        from django.db import transaction

        from .services.soldes import propager_report

        if nb_jours <= 0:
            raise ValidationError("Le nombre de jours à déduire doit être positif.")
        if nb_jours > self.solde_restant:
            raise ValidationError(
                f"Solde insuffisant : {self.solde_restant} jour(s) restant(s), {nb_jours} demandé(s)."
            )
        try:
            with transaction.atomic():
                self.jours_pris += nb_jours
                self.save()
                propager_report(self, strict=True)
        except ValidationError:
            # La base est annulée ; l'objet en mémoire doit revenir à son état d'origine.
            self.jours_pris -= nb_jours
            self.calculer_solde_restant()
            raise

    def crediter_jours(self, nb_jours, motif=""):
        """Recrédite le quota (annulation ou rejet après validation d'un congé annuel)."""
        from django.core.exceptions import ValidationError
        from django.db import transaction

        from .services.soldes import propager_report

        if nb_jours <= 0:
            raise ValidationError("Le nombre de jours à recréditer doit être positif.")
        if nb_jours > self.jours_pris:
            raise ValidationError(
                f"Impossible de recréditer {nb_jours} jour(s) : seuls {self.jours_pris} ont été déduits."
            )
        with transaction.atomic():
            self.jours_pris -= nb_jours
            self.save()
            propager_report(self)


class DemandeAbsenceQuerySet(models.QuerySet):
    def actives(self):
        return self.filter(statut_demande__in=STATUTS_EN_COURS)

    def pour_annee(self, annee):
        return self.filter(date_debut__year=annee)

    def jours_engages_conge_annuel(self, annee):
        """Somme des jours engagés au titre d'une année donnée."""
        total = self.filter(
            type_absence=TypeAbsence.CONGE_ANNUEL,
            statut_demande__in=STATUTS_EN_COURS,
        ).filter(
            models.Q(annee_titre=annee)
            | models.Q(
                annee_titre__isnull=True,
                date_debut__year=annee,
            )
        ).aggregate(total=models.Sum("nombre_jours"))["total"]

        return total or 0


class DemandeAbsence(models.Model):
    """Demande d'absence d'un agent (table `demandes_absence`, CDC §5.2)."""

    id_demande = models.BigAutoField(primary_key=True)
    numero_enregistrement = models.CharField(
        max_length=30, unique=True, null=True, blank=True, editable=False
    )
    personnel = models.ForeignKey(
        Personnel, on_delete=models.PROTECT, related_name="demandes", db_column="id_personnel"
    )
    type_absence = models.CharField(max_length=20, choices=TypeAbsence.choices)
    motif = models.TextField(blank=True)
    date_debut = models.DateField()
    date_fin = models.DateField()
    annee_titre = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="Année au titre de laquelle le congé annuel est demandé.",
    )
    date_evenement_prevue = models.DateField(
        null=True,
        blank=True,
        help_text=(
            "Date prévue de l'accouchement, obligatoire pour contrôler les délais "
            "des demandes de maternité et de paternité (RG-11)."
        ),
    )
    nombre_jours = models.PositiveSmallIntegerField(default=0)
    lieu_jouissance = models.CharField(max_length=200, blank=True)
    fichier_justificatif = models.FileField(upload_to="justificatifs/", null=True, blank=True)
    # Signature manuscrite dessinée avant la soumission. Le fichier et ses métadonnées
    # sont immuables via l'API (les demandes ne peuvent pas être modifiées).
    signature_agent = models.FileField(
        upload_to="signatures_demandes/", null=True, blank=True, editable=False
    )
    date_signature_agent = models.DateTimeField(null=True, blank=True, editable=False)
    signature_agent_sha256 = models.CharField(max_length=64, blank=True, editable=False)
    signature_agent_compte = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="demandes_signees_a_la_soumission",
        null=True,
        blank=True,
        editable=False,
    )
    # Copie figée du PDF officiel après insertion de la signature agent. Les
    # téléchargements ultérieurs servent strictement cet artefact identique.
    pdf_officiel = models.FileField(
        upload_to="formulaires_signatures/", null=True, blank=True, editable=False
    )
    pdf_officiel_sha256 = models.CharField(max_length=64, blank=True, editable=False)
    pdf_officiel_genere_le = models.DateTimeField(null=True, blank=True, editable=False)
    pdf_officiel_genere_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="formulaires_officiels_sceles",
        null=True,
        blank=True,
        editable=False,
    )
    # Ancre du dernier événement d'audit : permet de détecter l'effacement de la
    # dernière entrée du journal sans mettre à jour le journal lui-même.
    signature_audit_dernier_hash = models.CharField(max_length=64, blank=True, editable=False)
    statut_demande = models.CharField(
        max_length=15, choices=StatutDemande.choices, default=StatutDemande.EN_ATTENTE
    )
    date_creation = models.DateTimeField(auto_now_add=True)

    objects = DemandeAbsenceQuerySet.as_manager()

    class Meta:
        db_table = "demandes_absence"
        ordering = ["-date_creation"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(date_fin__gte=models.F("date_debut")),
                name="chk_demande_dates_coherentes",
            ),
            models.CheckConstraint(
                condition=models.Q(nombre_jours__gte=0), name="chk_demande_jours_positifs"
            ),
        ]
        indexes = [
            models.Index(
                fields=["personnel", "type_absence", "statut_demande"],
                name="idx_demande_quota",
            ),
            models.Index(fields=["date_debut", "date_fin"], name="idx_demande_periode"),
            models.Index(fields=["statut_demande", "-date_creation"], name="idx_demande_circuit"),
        ]

    def __str__(self):
        return (
            f"{self.numero_enregistrement or 'Demande'} - {self.personnel} "
            f"({self.get_type_absence_display()})"
        )

    def calculer_nombre_jours(self):
        """Jours calendaires, bornes incluses (CDC §3.1)."""
        self.nombre_jours = nombre_jours_calendaires(self.date_debut, self.date_fin)
        return self.nombre_jours

    def jours(self):
        """Chaque date couverte par la demande."""
        return list(iter_jours(self.date_debut, self.date_fin))

    @property
    def annee(self):
        """Année d'imputation, choisie pour le congé annuel."""
        return self.annee_titre or annee_de_reference(self.date_debut)

    def save(self, *args, **kwargs):
        creation = self.pk is None
        super().save(*args, **kwargs)
        if creation and not self.numero_enregistrement:
            self.numero_enregistrement = f"DA-{timezone.localdate().year}-{self.pk:05d}"
            super().save(update_fields=["numero_enregistrement"])

    def verifier_regles(self):
        """Applique RG-01, RG-02, RG-04, RG-08 et les règles d'éligibilité."""
        from .services.demandes import verifier_regles

        return verifier_regles(self)

    def soumettre_demande(self):
        """Enregistre la demande en attente de visa après vérification des règles."""
        from .services.demandes import soumettre_demande

        return soumettre_demande(self)

    def joindre_justificatif(self, fichier):
        """Attache une pièce justificative (RG-08)."""
        from .services.demandes import joindre_justificatif

        return joindre_justificatif(self, fichier)

    def generer_pdf_formulaire(self):
        """Génère le formulaire officiel pré-rempli (CDC §1.2, objectif 3)."""
        from .services.pdf import generer_formulaire_pdf

        return generer_formulaire_pdf(self)


class DecisionConge(models.Model):
    """Décision annuelle enregistrée par la RH : ouvre les droits à congé annuel (RG-04)."""

    id_decision = models.BigAutoField(primary_key=True)
    numero_decision = models.CharField(max_length=50, unique=True)
    personnel = models.ForeignKey(
        Personnel, on_delete=models.PROTECT, related_name="decisions", db_column="id_personnel"
    )
    direction = models.ForeignKey(
        Direction, on_delete=models.PROTECT, related_name="decisions", db_column="id_direction"
    )
    demande = models.ForeignKey(
        DemandeAbsence,
        on_delete=models.SET_NULL,
        related_name="decisions",
        db_column="id_demande",
        null=True,
        blank=True,
        help_text="Demande de congé annuel à l'origine de cette décision, le cas échéant.",
    )
    budget = models.CharField(max_length=100, default="Budget Général")
    imputation_budgetaire = models.CharField(max_length=100, blank=True)
    corps_grade = models.CharField(max_length=200, blank=True)
    indice = models.PositiveIntegerField(null=True, blank=True)
    annees_titre = models.CharField(max_length=50, help_text="Ex. : 2026 ou 2025-2026")
    details_jours = models.TextField(blank=True)
    date_demande_reference = models.DateField(null=True, blank=True)
    date_emission = models.DateField()
    signataire = models.CharField(max_length=150, blank=True)
    fichier_scan_path = models.FileField(upload_to="decisions/", blank=True)
    nature = models.CharField(
        max_length=20,
        choices=NatureDecision.choices,
        default=NatureDecision.SAISIE_MANUELLE,
        help_text="Indique si les données proviennent de l'OCR ou d'une saisie manuelle (RG-05).",
    )
    est_valide = models.BooleanField(default=False)

    class Meta:
        db_table = "decisions_conge"
        ordering = ["-date_emission"]
        indexes = [
            models.Index(fields=["personnel", "est_valide"], name="idx_decision_personnel"),
        ]

    def __str__(self):
        return f"Décision {self.numero_decision} - {self.personnel}"

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.personnel_id and self.personnel.est_stagiaire:
            raise ValidationError(
                "Les stagiaires n'ont pas droit au congé annuel : aucune décision ne peut être enregistrée."
            )

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def annees(self):
        """Années explicitement citées dans `annees_titre`, sans substitution implicite."""
        trouvees = [int(a) for a in re.findall(r"(?:19|20)\d{2}", self.annees_titre or "")]
        return sorted(set(trouvees))

    def extraire_donnees_ocr(self, fichier_scan):
        """Extrait IM, n° de décision, indice et années du scan (RG-05)."""
        from .services.ocr import extraire_donnees_decision

        return extraire_donnees_decision(fichier_scan)

    def valider_et_activer_par_rh(self):
        """Valide la décision et initialise le solde de chaque année concernée."""
        from .services.soldes import valider_et_activer_par_rh

        return valider_et_activer_par_rh(self)


class ValidationWorkflow(models.Model):
    """Trace les visas du chef de service et les décisions du directeur (CDC §5.2)."""

    id_validation = models.BigAutoField(primary_key=True)
    demande = models.ForeignKey(
        DemandeAbsence, on_delete=models.CASCADE, related_name="validations", db_column="id_demande"
    )
    valideur = models.ForeignKey(
        Personnel, on_delete=models.PROTECT, related_name="validations", db_column="id_valideur"
    )
    niveau = models.CharField(max_length=15, choices=Niveau.choices)
    avis = models.CharField(max_length=15, choices=Avis.choices)
    observation = models.TextField(blank=True)
    date_action = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "validations_workflow"
        ordering = ["date_action"]
        indexes = [models.Index(fields=["demande", "date_action"], name="idx_validation_demande")]

    def __str__(self):
        return f"{self.get_niveau_display()} - {self.get_avis_display()} ({self.demande_id})"

    @classmethod
    def enregistrer_avis(cls, demande, valideur, avis, observation=""):
        """Enregistre un visa (chef de service) ou une décision (directeur)."""
        from .services.validation import enregistrer_avis

        return enregistrer_avis(
            demande=demande, valideur=valideur, avis=avis, observation=observation
        )

class TraceSignatureQuerySet(models.QuerySet):
    """Journal append-only : les entrées existantes ne peuvent pas être mutées."""

    def update(self, **kwargs):
        from django.core.exceptions import ValidationError
        raise ValidationError("Les traces de signature ne peuvent pas être modifiées.")

    def delete(self):
        from django.core.exceptions import ValidationError
        raise ValidationError("Les traces de signature ne peuvent pas être supprimées.")


class TraceSignature(models.Model):
    """Journal de traçabilité avec chaînage SHA-256 par demande.

    Cette protection est applicative : un administrateur disposant d'un accès direct
    complet à la base ou au stockage peut toujours altérer les données et l'ancre.
    """

    class Evenement(models.TextChoices):
        SIGNATURE_AGENT_ENREGISTREE = "SIGNATURE_AGENT_ENREGISTREE", "Signature du demandeur enregistrée"
        PDF_OFFICIEL_SCELE = "PDF_OFFICIEL_SCELE", "Document officiel scellé"
        PDF_OFFICIEL_TELECHARGE = "PDF_OFFICIEL_TELECHARGE", "Document officiel téléchargé"

    id_trace = models.BigAutoField(primary_key=True)
    demande = models.ForeignKey(
        DemandeAbsence,
        on_delete=models.PROTECT,
        related_name="traces_signature",
        db_column="id_demande",
    )
    evenement = models.CharField(max_length=40, choices=Evenement.choices)
    date_evenement = models.DateTimeField(default=timezone.now, editable=False)
    acteur = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="traces_signature_effectuees",
        null=True,
        blank=True,
        editable=False,
    )
    acteur_id_snapshot = models.PositiveBigIntegerField(null=True, blank=True, editable=False)
    acteur_identifiant = models.CharField(max_length=150, default="système", editable=False)
    signature_sha256 = models.CharField(max_length=64, blank=True, editable=False)
    pdf_sha256 = models.CharField(max_length=64, blank=True, editable=False)
    empreinte_precedente = models.CharField(max_length=64, blank=True, editable=False)
    empreinte_evenement = models.CharField(max_length=64, unique=True, editable=False)
    details = models.JSONField(default=dict, blank=True, editable=False)

    objects = models.Manager.from_queryset(TraceSignatureQuerySet)()

    class Meta:
        db_table = "traces_signature"
        ordering = ["id_trace"]
        indexes = [
            models.Index(fields=["demande", "date_evenement"], name="idx_trace_sig_demande_date"),
        ]

    def save(self, *args, **kwargs):
        from django.core.exceptions import ValidationError
        if not self._state.adding:
            raise ValidationError("Les traces de signature sont en lecture seule.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        from django.core.exceptions import ValidationError
        raise ValidationError("Les traces de signature ne peuvent pas être supprimées.")

    def __str__(self):
        return f"{self.get_evenement_display()} — demande {self.demande_id} ({self.date_evenement:%Y-%m-%d %H:%M})"
