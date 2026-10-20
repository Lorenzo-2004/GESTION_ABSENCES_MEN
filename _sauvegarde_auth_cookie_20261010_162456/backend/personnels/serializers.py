from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Personnel, Utilisateur


class PersonnelSerializer(serializers.ModelSerializer):
    nom_complet = serializers.CharField(read_only=True)
    direction_libelle = serializers.CharField(source="direction.nom_direction", read_only=True)
    service_libelle = serializers.CharField(
        source="service.nom_service", read_only=True, default=None
    )

    class Meta:
        model = Personnel
        fields = [
            "id_personnel", "im", "cin", "nom", "prenoms", "nom_complet", "sexe",
            "date_naissance", "telephone", "email", "statut", "corps", "grade",
            "direction", "direction_libelle", "service", "service_libelle", "check_presence",
        ]

    def validate(self, attrs):
        # Reproduit l'invariant du modèle pour renvoyer une erreur 400 propre.
        direction = attrs.get("direction", getattr(self.instance, "direction", None))
        service = attrs.get("service", getattr(self.instance, "service", None))
        if service is not None and direction is not None and service.direction_id != direction.pk:
            raise serializers.ValidationError(
                {"service": "Ce service n'appartient pas à la direction choisie."}
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
    personnel = PersonnelSerializer(read_only=True)
    role_libelle = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = Utilisateur
        fields = ["id", "username", "email", "role", "role_libelle", "personnel", "last_login"]
        read_only_fields = fields


class ConnexionSerializer(TokenObtainPairSerializer):
    """Ajoute le rôle dans le jeton et le profil dans la réponse de connexion."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["id_personnel"] = user.personnel_id
        return token

    def validate(self, attrs):
        donnees = super().validate(attrs)
        donnees["utilisateur"] = UtilisateurSerializer(self.user).data
        return donnees


class ChangementMotDePasseSerializer(serializers.Serializer):
    ancien_mot_de_passe = serializers.CharField(write_only=True)
    nouveau_mot_de_passe = serializers.CharField(write_only=True)

    def validate_ancien_mot_de_passe(self, valeur):
        if not self.context["request"].user.check_password(valeur):
            raise serializers.ValidationError("Mot de passe actuel incorrect.")
        return valeur

    def validate_nouveau_mot_de_passe(self, valeur):
        from django.contrib.auth.password_validation import validate_password

        validate_password(valeur, self.context["request"].user)
        return valeur
