"""Sérialiseurs du domaine « congés » (CDC §3 et §5.2).

Les règles de gestion ne sont pas dupliquées ici : la validation métier est
déclenchée explicitement dans les vues via les services (`soumettre_demande`,
`enregistrer_avis`, …), qui restent la source de vérité.
"""

import base64
import binascii
import struct
from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers

from personnels.models import Personnel
from personnels.serializers import PersonnelSerializer
from .enums import TypeAbsence
from .regles import TYPES_PERIODE_AUTOMATIQUE, periode_automatique

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

    # Le canvas transmet une image PNG encodée en data URL. Le champ est write-only :
    # on ne renvoie jamais le chemin privé du fichier au navigateur.
    signature_agent = serializers.CharField(
        required=True, write_only=True, allow_blank=False, trim_whitespace=False,
        max_length=3_000_000,
    )
    date_signature_agent = serializers.DateTimeField(read_only=True)
    signature_agent_sha256 = serializers.CharField(read_only=True)
    signature_agent_compte = serializers.CharField(
        source="signature_agent_compte.username", read_only=True, allow_null=True
    )
    pdf_officiel_sha256 = serializers.CharField(read_only=True)
    pdf_officiel_genere_le = serializers.DateTimeField(read_only=True)
    pdf_officiel_genere_par = serializers.CharField(
        source="pdf_officiel_genere_par.username", read_only=True, allow_null=True
    )

    class Meta:
        model = DemandeAbsence
        fields = [
            "id_demande", "numero_enregistrement", "personnel", "personnel_detail",
            "type_absence", "annee_titre", "date_evenement_prevue", "type_absence_libelle", "motif", "date_debut", "date_fin",
            "nombre_jours", "lieu_jouissance", "fichier_justificatif", "signature_agent",
            "date_signature_agent", "signature_agent_sha256", "signature_agent_compte",
            "pdf_officiel_sha256", "pdf_officiel_genere_le", "pdf_officiel_genere_par",
            "statut_demande", "statut_libelle", "date_creation", "validations", "justificatif_url",
        ]
        read_only_fields = ["numero_enregistrement", "nombre_jours", "statut_demande", "date_creation"]
        # Début et fin sont facultatifs au niveau du champ : pour maternité/paternité
        # ils sont calculés ; pour les autres types, validate() les exige.
        extra_kwargs = {
            "date_debut": {"required": False},
            "date_fin": {"required": False},
        }

    def to_internal_value(self, data):
        """Refuse les champs inconnus au lieu de les ignorer en silence.

        DRF jette sans prévenir toute clé absente du sérialiseur : une donnée du
        formulaire non prévue côté backend disparaîtrait sans erreur.
        """
        if hasattr(data, "keys"):
            inconnus = sorted(set(data.keys()) - set(self.fields.keys()))
            if inconnus:
                raise serializers.ValidationError({
                    cle: "Champ non reconnu : il ne serait pas enregistré." for cle in inconnus
                })
        return super().to_internal_value(data)

    def validate_signature_agent(self, valeur):
        """Valide une signature dessinée et la convertit en PNG avant stockage."""
        prefixe = "data:image/png;base64,"
        if not isinstance(valeur, str) or not valeur.startswith(prefixe):
            raise serializers.ValidationError(
                "Tracez votre signature dans la zone prévue avant de soumettre la demande."
            )
        try:
            contenu = base64.b64decode(valeur[len(prefixe):], validate=True)
        except (binascii.Error, ValueError) as exc:
            raise serializers.ValidationError("La signature fournie n'est pas une image valide.") from exc

        if not contenu or len(contenu) > 2 * 1024 * 1024:
            raise serializers.ValidationError("La signature est vide ou dépasse la taille autorisée.")
        if not contenu.startswith(b"\x89PNG\r\n\x1a\n") or len(contenu) < 24 or contenu[12:16] != b"IHDR":
            raise serializers.ValidationError("La signature doit être une image PNG valide.")
        largeur, hauteur = struct.unpack(">II", contenu[16:24])
        if not (100 <= largeur <= 1600 and 30 <= hauteur <= 600):
            raise serializers.ValidationError("La taille de la signature n'est pas valide.")

        try:
            with Image.open(BytesIO(contenu)) as image:
                image.verify()
            with Image.open(BytesIO(contenu)) as image:
                rgba = image.convert("RGBA")
                pixels_opaques = 0
                # Le canvas est transparent sauf les traits d'encre. Refuse une image blanche/vide.
                for rouge, vert, bleu, alpha in rgba.getdata():
                    if alpha > 40 and max(rouge, vert, bleu) < 190:
                        pixels_opaques += 1
                        if pixels_opaques >= 12:
                            break
                if pixels_opaques < 12:
                    raise serializers.ValidationError("Veuillez tracer votre signature avant de continuer.")
        except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
            raise serializers.ValidationError("La signature fournie n'est pas une image valide.") from exc

        return ContentFile(contenu, name="signature-agent.png")

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
        """Valide année de titre, période (saisie ou calculée) et champs du formulaire."""

        type_absence = attrs.get("type_absence")
        erreurs = {}

        if type_absence == TypeAbsence.CONGE_ANNUEL and not attrs.get("annee_titre"):
            erreurs["annee_titre"] = (
                "L'année au titre de laquelle le congé est demandé est obligatoire."
            )

        # Le formulaire officiel doit être imprimable en entier : ces deux champs
        # sont donc obligatoires dès la saisie, quel que soit le type d'absence.
        for champ, libelle in (("motif", "Le motif"), ("lieu_jouissance", "Le lieu de jouissance")):
            if not (attrs.get(champ) or "").strip():
                erreurs[champ] = f"{libelle} est obligatoire."

        if type_absence in TYPES_PERIODE_AUTOMATIQUE:
            evenement = attrs.get("date_evenement_prevue")
            if evenement is None:
                erreurs["date_evenement_prevue"] = (
                    "La date prévue de l'accouchement est obligatoire."
                )
            else:
                # Les dates éventuellement envoyées par le client sont écrasées.
                attrs["date_debut"], attrs["date_fin"] = periode_automatique(type_absence, evenement)
        else:
            for champ, libelle in (("date_debut", "début"), ("date_fin", "fin")):
                if attrs.get(champ) is None:
                    erreurs[champ] = f"La date de {libelle} est obligatoire."
            debut, fin = attrs.get("date_debut"), attrs.get("date_fin")
            if debut and fin and fin < debut:
                erreurs["date_fin"] = "La date de fin ne peut pas précéder la date de début."

        if erreurs:
            raise serializers.ValidationError(erreurs)
        return attrs

    def get_validations(self, obj):
        return ValidationWorkflowSerializer(obj.validations.all(), many=True).data

    def get_justificatif_url(self, obj):
        if not obj.fichier_justificatif:
            return None
        # Route GET réelle (l'URL « .../justificatif/ » seule n'accepte que le dépôt en POST).
        return f"/api/demandes/{obj.pk}/justificatif/telecharger/"


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