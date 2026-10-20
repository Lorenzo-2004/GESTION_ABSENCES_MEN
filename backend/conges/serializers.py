"""Sérialiseurs du domaine « congés » (CDC §3 et §5.2).

Les règles de gestion ne sont pas dupliquées ici : la validation métier est
déclenchée explicitement dans les vues via les services (`soumettre_demande`,
`enregistrer_avis`, …), qui restent la source de vérité.
"""

from rest_framework import serializers

from personnels.models import Personnel
from personnels.serializers import PersonnelSerializer
from .enums import TypeAbsence

from .models import DecisionConge, DemandeAbsence, SoldeConge, ValidationWorkflow


class DemandeAbsenceSerializer(serializers.ModelSerializer):
    personnel_detail = PersonnelSerializer(source="personnel", read_only=True)
    type_absence_libelle = serializers.CharField(source="get_type_absence_display", read_only=True)
    statut_libelle = serializers.CharField(source="get_statut_demande_display", read_only=True)
    validations = serializers.SerializerMethodField()
    justificatif_url = serializers.SerializerMethodField()

    fichier_justificatif = serializers.FileField(
        required=False,
        allow_null=True,
        write_only=True,
    )

    class Meta:
        model = DemandeAbsence
        fields = [
            "id_demande", "numero_enregistrement", "personnel", "personnel_detail",
            "type_absence", "annee_titre", "date_evenement_prevue", "type_absence_libelle", "motif", "date_debut", "date_fin",
            "nombre_jours", "lieu_jouissance", "fichier_justificatif", "statut_demande", "statut_libelle",
            "date_creation", "validations", "justificatif_url",
        ]
        read_only_fields = ["numero_enregistrement", "nombre_jours", "statut_demande", "date_creation"]

    def validate_fichier_justificatif(self, fichier):
        """Valide le format et la taille du justificatif facultatif."""

        if fichier is None:
            return fichier

        from django.core.exceptions import ValidationError as DjangoValidationError
        from .services.demandes import valider_fichier_justificatif

        try:
            valider_fichier_justificatif(fichier)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc

        return fichier
    
    def validate(self, attrs):
        """Valide les dates et l'année au titre du congé annuel."""

        type_absence = attrs.get("type_absence")
        annee_titre = attrs.get("annee_titre")

        if (
            type_absence == TypeAbsence.CONGE_ANNUEL
            and not annee_titre
        ):
            raise serializers.ValidationError({
                "annee_titre": (
                    "L'année au titre de laquelle le congé est demandé "
                    "est obligatoire."
                )
            })

        date_debut = attrs.get("date_debut")
        date_fin = attrs.get("date_fin")

        if (
            date_debut is not None
            and date_fin is not None
            and date_fin < date_debut
        ):
            raise serializers.ValidationError({
                "date_fin": (
                    "La date de fin ne peut pas précéder "
                    "la date de début."
                )
            })

        return attrs

    def get_validations(self, obj):
        return ValidationWorkflowSerializer(obj.validations.all(), many=True).data

    def get_justificatif_url(self, obj):
        if not obj.fichier_justificatif:
            return None
        return f"/api/demandes/{obj.pk}/justificatif/"


class DemandeAbsenceSoumissionSerializer(DemandeAbsenceSerializer):
    """Variante utilisée à la création : `personnel` est accepté en écriture seule.

    Il vaut None pour une demande pour soi-même ; un chef de service peut le
    renseigner pour un agent de son service (useCase UC_SaisieChef_Delegated).
    La vue contrôle le périmètre et remplace la valeur avant l'enregistrement.
    """

    personnel = serializers.PrimaryKeyRelatedField(
        queryset=Personnel.objects.all(), required=False
    )

    class Meta(DemandeAbsenceSerializer.Meta):
        fields = DemandeAbsenceSerializer.Meta.fields


class AvisSerializer(serializers.Serializer):
    """Corps attendu par l'endpoint d'avis (visa du chef ou décision du directeur)."""

    avis = serializers.ChoiceField(choices=["FAVORABLE", "DEFAVORABLE"])
    observation = serializers.CharField(required=False, allow_blank=True, default="")


class ValidationWorkflowSerializer(serializers.ModelSerializer):
    valideur_detail = PersonnelSerializer(source="valideur", read_only=True)
    niveau_libelle = serializers.CharField(source="get_niveau_display", read_only=True)
    avis_libelle = serializers.CharField(source="get_avis_display", read_only=True)

    class Meta:
        model = ValidationWorkflow
        fields = [
            "id_validation", "demande", "valideur", "valideur_detail", "niveau",
            "niveau_libelle", "avis", "avis_libelle", "observation", "date_action",
        ]


class SoldeCongeSerializer(serializers.ModelSerializer):
    personnel_detail = PersonnelSerializer(source="personnel", read_only=True)

    class Meta:
        model = SoldeConge
        fields = [
            "id_solde", "personnel", "personnel_detail", "annee", "droit_annuel",
            "report_anterieur", "jours_pris", "solde_restant",
        ]
        read_only_fields = ["solde_restant"]


class DecisionCongeSerializer(serializers.ModelSerializer):
    personnel_detail = PersonnelSerializer(source="personnel", read_only=True)
    nature_libelle = serializers.CharField(source="get_nature_display", read_only=True)
    class Meta:
        model = DecisionConge
        fields = [
            "id_decision", "numero_decision", "personnel", "personnel_detail", "direction",
            "demande", "budget", "imputation_budgetaire", "corps_grade", "indice",
            "annees_titre", "details_jours", "date_demande_reference", "date_emission",
            "signataire", "fichier_scan_path", "nature", "nature_libelle", "est_valide",
        ]
        read_only_fields = ["est_valide"]


class ScanDecisionSerializer(serializers.Serializer):
    """Scan téléversé par la RH pour extraction OCR (CDC §3.2 Phase 1)."""

    fichier = serializers.FileField()

    def validate_fichier(self, fichier):
        from .regles import (
            EXTENSIONS_JUSTIFICATIF_AUTORISEES,
            TAILLE_MAX_JUSTIFICATIF_OCTETS,
        )

        nom = (fichier.name or "").lower()
        if not nom.endswith(EXTENSIONS_JUSTIFICATIF_AUTORISEES):
            formats = ", ".join(EXTENSIONS_JUSTIFICATIF_AUTORISEES)
            raise serializers.ValidationError(
                f"Format non autorisé. Formats acceptés : {formats}."
            )

        taille = getattr(fichier, "size", 0) or 0
        if taille <= 0:
            raise serializers.ValidationError("Le fichier est vide.")
        if taille > TAILLE_MAX_JUSTIFICATIF_OCTETS:
            raise serializers.ValidationError(
                "Le scan dépasse la taille maximale autorisée de 15 Mo."
            )

        # Vérification minimale de la signature du fichier : l'extension seule
        # ne suffit pas à identifier un PDF ou une image valide.
        position = fichier.tell() if hasattr(fichier, "tell") else None
        try:
            entete = fichier.read(8)
        finally:
            if position is not None and hasattr(fichier, "seek"):
                fichier.seek(position)

        signatures = {
            ".pdf": (b"%PDF-",),
            ".jpg": (b"\xff\xd8\xff",),
            ".jpeg": (b"\xff\xd8\xff",),
            ".png": (b"\x89PNG\r\n\x1a\n",),
            ".tif": (b"II*\x00", b"MM\x00*"),
            ".tiff": (b"II*\x00", b"MM\x00*"),
        }
        extension = next(
            (ext for ext in signatures if nom.endswith(ext)),
            None,
        )
        if extension is None or not any(
            entete.startswith(signature) for signature in signatures[extension]
        ):
            raise serializers.ValidationError(
                "Le contenu du fichier ne correspond pas à son extension."
            )

        return fichier


class PlanningEquipeSerializer(serializers.Serializer):
    """Élément du planning d'équipe : une absence posée sur une période."""

    id_demande = serializers.IntegerField()
    personnel_id = serializers.IntegerField()
    personnel_nom = serializers.CharField()
    type_absence = serializers.CharField()
    type_absence_libelle = serializers.CharField()
    date_debut = serializers.DateField()
    date_fin = serializers.DateField()
    nombre_jours = serializers.IntegerField()
    statut_demande = serializers.CharField()
