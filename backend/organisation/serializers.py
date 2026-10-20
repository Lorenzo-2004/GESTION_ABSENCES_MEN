from rest_framework import serializers

from .models import Direction, Service


class ServiceSerializer(serializers.ModelSerializer):
    direction_libelle = serializers.CharField(source="direction.nom_direction", read_only=True)

    class Meta:
        model = Service
        fields = ["id_service", "code_service", "nom_service", "direction", "direction_libelle"]


class DirectionSerializer(serializers.ModelSerializer):
    services = ServiceSerializer(many=True, read_only=True)

    class Meta:
        model = Direction
        fields = ["id_direction", "code_direction", "nom_direction", "services"]
