from datetime import timedelta
import re

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone

from rest_framework import serializers
from rest_framework.exceptions import APIException
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .enums import Role
from .models import Personnel, Utilisateur


class PersonnelSerializer(serializers.ModelSerializer):
    nom_complet = serializers.CharField(read_only=True)

    direction_libelle = serializers.CharField(
        source="direction.nom_direction",
        read_only=True,
    )

    service_libelle = serializers.CharField(
        source="service.nom_service",
        read_only=True,
        default=None,
    )

    class Meta:
        model = Personnel
        fields = [
            "id_personnel",
            "im",
            "cin",
            "nom",
            "prenoms",
            "nom_complet",
            "sexe",
            "date_naissance",
            "telephone",
            "email",
            "statut",
            "corps",
            "grade",
            "direction",
            "direction_libelle",
            "service",
            "service_libelle",
            "check_presence",
        ]

    @staticmethod
    def _texte_nom_valide(valeur):
        """Autorise les lettres Unicode, espaces, apostrophes et traits d'union."""
        texte = valeur.strip()
        return bool(texte) and all(
            caractere.isalpha() or caractere in " '’-"
            for caractere in texte
        )

    @staticmethod
    def _libelle_administratif_valide(valeur):
        """Autorise un libellé avec lettres, chiffres et ponctuation usuelle."""
        texte = valeur.strip()
        autorises = set(" '’()-./")
        return bool(texte) and any(c.isalpha() for c in texte) and all(
            c.isalpha() or c.isdigit() or c in autorises
            for c in texte
        )

    def validate_im(self, value):
        valeur = value.strip()
        if not re.fullmatch(r"[0-9]{6}", valeur):
            raise serializers.ValidationError(
                "L'IM doit contenir exactement 6 chiffres."
            )
        return valeur

    def validate_cin(self, value):
        # Les espaces sont tolérés pour les anciennes fiches administratives,
        # mais la valeur est enregistrée sous une forme canonique de 12 chiffres.
        valeur = re.sub(r"\s+", "", value)
        if not re.fullmatch(r"[0-9]{12}", valeur):
            raise serializers.ValidationError(
                "La CIN doit contenir exactement 12 chiffres."
            )

        doublons = Personnel.objects.exclude(
            pk=self.instance.pk if self.instance else None,
        ).values_list("cin", flat=True)
        if any(re.sub(r"\s+", "", existante) == valeur for existante in doublons):
            raise serializers.ValidationError(
                "Cette CIN est déjà attribuée à un autre agent."
            )
        return valeur

    def validate_nom(self, value):
        if not self._texte_nom_valide(value):
            raise serializers.ValidationError(
                "Le nom ne doit contenir que des lettres, espaces, apostrophes ou traits d'union."
            )
        return value.strip()

    def validate_prenoms(self, value):
        if not self._texte_nom_valide(value):
            raise serializers.ValidationError(
                "Les prénoms ne doivent contenir que des lettres, espaces, apostrophes ou traits d'union."
            )
        return value.strip()

    def validate_date_naissance(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError(
                "La date de naissance ne peut pas être dans le futur."
            )
        return value

    def validate_telephone(self, value):
        valeur = value.strip()
        if not valeur:
            return valeur
        if not re.fullmatch(r"[0-9+() .\-]+", valeur):
            raise serializers.ValidationError(
                "Le téléphone contient des caractères non autorisés."
            )
        nombre_chiffres = len(re.sub(r"\D", "", valeur))
        if not 8 <= nombre_chiffres <= 15:
            raise serializers.ValidationError(
                "Le téléphone doit contenir entre 8 et 15 chiffres."
            )
        return valeur

    def validate_corps(self, value):
        if not self._libelle_administratif_valide(value):
            raise serializers.ValidationError(
                "Le corps doit contenir au moins une lettre et uniquement des caractères autorisés."
            )
        return value.strip()

    def validate_grade(self, value):
        if not self._libelle_administratif_valide(value):
            raise serializers.ValidationError(
                "Le grade doit contenir au moins une lettre et uniquement des caractères autorisés."
            )
        return value.strip()

    def validate(self, attrs):
        direction = attrs.get(
            "direction",
            getattr(self.instance, "direction", None),
        )

        service = attrs.get(
            "service",
            getattr(self.instance, "service", None),
        )

        if self.instance is None:
            champs_obligatoires = {
                "prenoms": "Les prénoms sont obligatoires.",
                "corps": "Le corps est obligatoire.",
                "grade": "Le grade est obligatoire.",
            }
            erreurs = {
                champ: message
                for champ, message in champs_obligatoires.items()
                if not str(attrs.get(champ, "")).strip()
            }
            if erreurs:
                raise serializers.ValidationError(erreurs)

        if (
            service is not None
            and direction is not None
            and service.direction_id != direction.pk
        ):
            raise serializers.ValidationError(
                {
                    "service": (
                        "Ce service n'appartient pas à la direction choisie."
                    )
                }
            )

        return attrs


class PersonnelPourDemandeSerializer(serializers.ModelSerializer):
    """Informations du personnel nécessaires au formulaire de demande."""

    nom_complet = serializers.CharField(read_only=True)

    direction_libelle = serializers.CharField(
        source="direction.nom_direction",
        read_only=True,
    )

    service_libelle = serializers.CharField(
        source="service.nom_service",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = Personnel
        fields = [
            "id_personnel",
            "im",
            "nom",
            "prenoms",
            "nom_complet",
            "statut",
            "corps",
            "grade",
            "direction_libelle",
            "service_libelle",
        ]

        read_only_fields = fields


class UtilisateurSerializer(serializers.ModelSerializer):
    """Sérialiseur public du compte connecté."""

    personnel = PersonnelSerializer(read_only=True)

    role_libelle = serializers.CharField(
        source="get_role_display",
        read_only=True,
    )

    class Meta:
        model = Utilisateur
        fields = [
            "id",
            "username",
            "email",
            "role",
            "role_libelle",
            "personnel",
            "last_login",
        ]

        read_only_fields = fields


class UtilisateurAdministrationSerializer(serializers.ModelSerializer):
    """Sérialiseur réservé à l'administration des comptes utilisateurs."""

    personnel_im = serializers.CharField(
        source="personnel.im",
        read_only=True,
    )

    personnel_nom = serializers.CharField(
        source="personnel.nom_complet",
        read_only=True,
    )

    personnel_direction = serializers.CharField(
        source="personnel.direction.nom_direction",
        read_only=True,
    )

    role_libelle = serializers.CharField(
        source="get_role_display",
        read_only=True,
    )

    personnel = serializers.PrimaryKeyRelatedField(
        queryset=Personnel.objects.all(),
        required=True,
    )

    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=False,
        trim_whitespace=False,
    )

    class Meta:
        model = Utilisateur

        fields = [
            "id",
            "username",
            "email",
            "role",
            "role_libelle",
            "personnel",
            "personnel_im",
            "personnel_nom",
            "personnel_direction",
            "is_active",
            "date_joined",
            "last_login",
            "password",
        ]

        read_only_fields = [
            "id",
            "username",
            "role_libelle",
            "personnel_im",
            "personnel_nom",
            "personnel_direction",
            "date_joined",
            "last_login",
        ]

    def validate(self, attrs):
        creation = self.instance is None

        role = attrs.get(
            "role",
            self.instance.role if self.instance else Role.AGENT,
        )

        personnel = attrs.get(
            "personnel",
            self.instance.personnel if self.instance else None,
        )

        password = attrs.get("password")

        # Tout compte géré par cette interface doit être
        # associé à une fiche de personnel.
        if personnel is None:
            raise serializers.ValidationError(
                {
                    "personnel": (
                        "Sélectionnez une fiche de personnel pour ce compte."
                    )
                }
            )

        # La création ou l'attribution d'un rôle administrateur
        # est exclue de cette interface de gestion courante.
        if role == Role.ADMIN:
            raise serializers.ValidationError(
                {
                    "role": (
                        "Le rôle Administrateur ne peut pas être attribué "
                        "depuis cette interface."
                    )
                }
            )

        # Vérifier qu'aucun autre compte n'utilise déjà cette fiche.
        comptes_existants = Utilisateur.objects.filter(
            personnel=personnel,
        )

        if self.instance is not None:
            comptes_existants = comptes_existants.exclude(
                pk=self.instance.pk,
            )

        if comptes_existants.exists():
            raise serializers.ValidationError(
                {
                    "personnel": (
                        "Cette fiche de personnel possède déjà un compte."
                    )
                }
            )

        if creation:
            # Le nom d'utilisateur technique reprend l'IM.
            if Utilisateur.objects.filter(
                username=personnel.im,
            ).exists():
                raise serializers.ValidationError(
                    {
                        "personnel": (
                            "Un nom d'utilisateur existe déjà pour cet IM."
                        )
                    }
                )

            if not password:
                raise serializers.ValidationError(
                    {
                        "password": (
                            "Le mot de passe initial est obligatoire."
                        )
                    }
                )

        # Appliquer les validateurs Django pour tout nouveau mot de passe.
        if password:
            utilisateur_test = self.instance or Utilisateur(
                username=personnel.im,
                role=role,
                personnel=personnel,
                email=attrs.get("email", ""),
            )

            try:
                validate_password(password, utilisateur_test)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(
                    {
                        "password": list(exc.messages),
                    }
                ) from exc

        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        personnel = validated_data["personnel"]

        # create_user applique le hachage du mot de passe Django.
        return Utilisateur.objects.create_user(
            username=personnel.im,
            password=password,
            **validated_data,
        )

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)

        for champ, valeur in validated_data.items():
            setattr(instance, champ, valeur)

        if password:
            instance.set_password(password)

        instance.save()

        return instance


class IdentifiantsConnexionInvalides(APIException):
    """Erreur générique de connexion."""

    status_code = 401
    default_detail = "Identifiant ou mot de passe incorrect."
    default_code = "identifiants_invalides"
    auth_header = "Bearer"


class ConnexionSerializer(TokenObtainPairSerializer):
    """Connexion historique avec informations du compte et claims métier."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        token["role"] = user.role
        token["id_personnel"] = user.personnel_id
        # Claim immuable pendant les rotations : empêche une session glissante
        # de se prolonger indéfiniment en renouvelant son refresh token.
        token["session_started"] = int(timezone.now().timestamp())

        return token

    def validate(self, attrs):
        donnees = super().validate(attrs)

        donnees["utilisateur"] = UtilisateurSerializer(
            self.user,
        ).data

        return donnees


class ConnexionSessionSerializer(serializers.Serializer):
    """Connexion par IM, ou par username pour l'admin sans personnel."""

    identifiant = serializers.CharField(
        max_length=150,
        trim_whitespace=True,
    )

    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )

    def validate(self, attrs):
        identifiant = attrs["identifiant"]
        mot_de_passe = attrs["password"]

        compte_personnel = (
            Utilisateur.objects
            .filter(personnel__im=identifiant)
            .select_related("personnel")
            .first()
        )

        compte_admin = Utilisateur.objects.filter(
            username=identifiant,
            role=Role.ADMIN,
            personnel__isnull=True,
        ).first()

        # Refuser un identifiant ambigu.
        if (
            compte_personnel is not None
            and compte_admin is not None
        ):
            raise IdentifiantsConnexionInvalides()

        compte = compte_personnel or compte_admin

        if compte is None:
            raise IdentifiantsConnexionInvalides()

        utilisateur = authenticate(
            request=self.context.get("request"),
            username=compte.username,
            password=mot_de_passe,
        )

        if utilisateur is None:
            raise IdentifiantsConnexionInvalides()

        refresh = ConnexionSerializer.get_token(utilisateur)

        return {
            "utilisateur": utilisateur,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        }


class ChangementMotDePasseSerializer(serializers.Serializer):
    ancien_mot_de_passe = serializers.CharField(
        write_only=True,
    )

    nouveau_mot_de_passe = serializers.CharField(
        write_only=True,
    )

    def validate_ancien_mot_de_passe(self, valeur):
        if not self.context["request"].user.check_password(valeur):
            raise serializers.ValidationError(
                "Mot de passe actuel incorrect."
            )

        return valeur

    def validate_nouveau_mot_de_passe(self, valeur):
        validate_password(
            valeur,
            self.context["request"].user,
        )

        return valeur

class SessionLimiteeTokenRefreshSerializer(TokenRefreshSerializer):
    """Renouvelle un jeton uniquement avant la limite absolue de session.

    Les anciens jetons sans claim dédié utilisent leur ``iat`` comme point de
    départ ; lorsqu'ils sont encore valides, le claim est ajouté avant rotation.
    """

    def validate(self, attrs):
        try:
            refresh = RefreshToken(attrs["refresh"])
        except (TokenError, TypeError, ValueError) as exc:
            raise InvalidToken("Jeton de session invalide.") from exc

        maintenant = int(timezone.now().timestamp())
        debut_session = refresh.get("session_started", refresh.get("iat"))
        max_age = int(
            getattr(settings, "MEN_SESSION_MAX_AGE", timedelta(hours=8)).total_seconds()
        )

        if (
            not isinstance(debut_session, int)
            or isinstance(debut_session, bool)
            or debut_session <= 0
            or debut_session > maintenant + 60
            or maintenant - debut_session >= max_age
        ):
            raise InvalidToken("La session a expiré. Veuillez vous reconnecter.")

        # Compatibilité avec les refresh tokens émis avant l'ajout de ce claim.
        if "session_started" not in refresh:
            refresh["session_started"] = debut_session
            attrs = {**attrs, "refresh": str(refresh)}

        return super().validate(attrs)
