from rest_framework import permissions, viewsets

from commun.permissions import EstAdminOuLectureSeule

from .models import Direction, Service
from .serializers import DirectionSerializer, ServiceSerializer


class DirectionViewSet(viewsets.ModelViewSet):
    """Directions du ministère : lecture pour tous, écriture administrateur."""

    queryset = Direction.objects.prefetch_related("services")
    serializer_class = DirectionSerializer
    permission_classes = [permissions.IsAuthenticated, EstAdminOuLectureSeule]
    search_fields = ["code_direction", "nom_direction"]


class ServiceViewSet(viewsets.ModelViewSet):
    queryset = Service.objects.select_related("direction")
    serializer_class = ServiceSerializer
    permission_classes = [permissions.IsAuthenticated, EstAdminOuLectureSeule]
    filterset_fields = ["direction"]
    search_fields = ["code_service", "nom_service"]
