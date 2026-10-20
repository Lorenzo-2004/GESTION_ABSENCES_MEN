from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from commun.permissions import EstRHOuLectureSeule, filtre_perimetre

from .models import Personnel
from .serializers import (
    ChangementMotDePasseSerializer,
    ConnexionSerializer,
    PersonnelPourDemandeSerializer,
    PersonnelSerializer,
    UtilisateurSerializer,
)


class ConnexionView(TokenObtainPairView):
    """POST {username, password} -> {access, refresh, utilisateur}."""

    serializer_class = ConnexionSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "connexion"  # 10/minute en production (anti force brute)


class DeconnexionView(APIView):
    """POST {refresh} : révoque le jeton de rafraîchissement (liste noire)."""

    def post(self, request):
        try:
            RefreshToken(request.data.get("refresh")).blacklist()
        except (TokenError, TypeError):
            return Response(
                {"detail": "Jeton de rafraîchissement invalide.", "erreurs": {}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MoiView(generics.RetrieveAPIView):
    """Profil du compte connecté."""

    serializer_class = UtilisateurSerializer

    def get_object(self):
        return self.request.user


class ChangementMotDePasseView(APIView):
    def post(self, request):
        serializer = ChangementMotDePasseSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data["nouveau_mot_de_passe"])
        request.user.save()
        return Response({"detail": "Mot de passe modifié."})


class PersonnelViewSet(viewsets.ModelViewSet):
    """Fiches du personnel : lecture selon le périmètre (RG-06), écriture RH."""

    serializer_class = PersonnelSerializer
    permission_classes = [permissions.IsAuthenticated, EstRHOuLectureSeule]
    filterset_fields = ["direction", "service", "statut", "sexe"]
    search_fields = ["im", "cin", "nom", "prenoms"]
    ordering_fields = ["nom", "im"]

    def get_queryset(self):
        return (
            Personnel.objects.select_related("direction", "service")
            .filter(filtre_perimetre(self.request.user, prefixe=""))
        )
    
    @action(
        detail=False,
        methods=["get"],
        url_path="par-im",
    )
    def par_im(self, request):
        """Recherche un personnel par IM exact dans le périmètre autorisé."""

        im = request.query_params.get("im", "").strip()

        if not im:
            return Response(
                {"detail": "Le paramètre IM est obligatoire."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        personnel = self.get_queryset().filter(im__iexact=im).first()

        if personnel is None:
            return Response(
                {
                    "detail": (
                        "Aucun personnel trouvé pour cet IM "
                        "dans votre périmètre."
                    )
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = PersonnelPourDemandeSerializer(
            personnel,
            context=self.get_serializer_context(),
        )

        return Response(serializer.data, status=status.HTTP_200_OK)
