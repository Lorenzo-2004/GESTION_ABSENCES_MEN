from datetime import timedelta

from django.conf import settings
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_protect

from rest_framework import (
    filters,
    generics,
    mixins,
    permissions,
    status,
    viewsets,
)
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from commun.permissions import (
    EstAdmin,
    EstRHOuLectureSeule,
    filtre_perimetre,
)

from .enums import Role
from .models import Personnel, Utilisateur
from .serializers import (
    ChangementMotDePasseSerializer,
    ConnexionSerializer,
    ConnexionSessionSerializer,
    PersonnelPourDemandeSerializer,
    PersonnelSerializer,
    UtilisateurAdministrationSerializer,
    UtilisateurSerializer,
    SessionLimiteeTokenRefreshSerializer,
)
from .throttling import (
    ConnexionParHeureThrottle,
    ConnexionParMinuteThrottle,
    RafraichissementSessionThrottle,
)


def _secondes_restantes_session(jeton_refresh: str) -> int:
    """Calcule le temps restant avant l'expiration du jeton et de la session absolue."""
    jeton = RefreshToken(jeton_refresh)
    maintenant = int(timezone.now().timestamp())
    debut = jeton.get("session_started", jeton.get("iat"))
    max_age = int(
        getattr(settings, "MEN_SESSION_MAX_AGE", timedelta(hours=8)).total_seconds()
    )
    if not isinstance(debut, int) or isinstance(debut, bool):
        return 0
    expiration_absolue = debut + max_age
    expiration_jeton = int(jeton.get("exp", 0))
    return max(0, min(expiration_absolue, expiration_jeton) - maintenant)


def _max_age_cookie_access(jeton_access: str, session_restante: int) -> int:
    """N'autorise pas le cookie d'accès à survivre à la session absolue."""
    jeton = AccessToken(jeton_access)
    maintenant = int(timezone.now().timestamp())
    return max(0, min(int(jeton.get("exp", maintenant)) - maintenant, session_restante))


def _effacer_cookies_auth(reponse):
    """Expire les cookies JWT quand une session est absente ou expirée."""
    secure = getattr(settings, "MEN_AUTH_COOKIE_SECURE", settings.CSRF_COOKIE_SECURE)
    samesite = getattr(settings, "MEN_AUTH_COOKIE_SAMESITE", "Lax")
    reponse.set_cookie("men_access", "", max_age=0, httponly=True, secure=secure, samesite=samesite, path="/api/")
    reponse.set_cookie("men_refresh", "", max_age=0, httponly=True, secure=secure, samesite=samesite, path="/api/auth/session/")
    return reponse


def _reponse_session_expiree():
    from rest_framework.response import Response
    reponse = Response(
        {"detail": "Votre session a expiré. Veuillez vous reconnecter.", "erreurs": {}},
        status=status.HTTP_401_UNAUTHORIZED,
    )
    return _effacer_cookies_auth(reponse)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class InitialisationCSRFView(APIView):
    """Fournit un jeton CSRF au frontend avant une requête sensible."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
class ConnexionSessionView(APIView):
    """Connexion navigateur : JWT dans les cookies, jamais dans le JSON."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ConnexionParMinuteThrottle, ConnexionParHeureThrottle]

    def post(self, request):
        serializer = ConnexionSessionSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        utilisateur = serializer.validated_data["utilisateur"]
        access = serializer.validated_data["access"]
        refresh = serializer.validated_data["refresh"]

        reponse = Response(
            {"utilisateur": UtilisateurSerializer(utilisateur).data},
            status=status.HTTP_200_OK,
        )

        secure = getattr(
            settings,
            "MEN_AUTH_COOKIE_SECURE",
            settings.CSRF_COOKIE_SECURE,
        )
        samesite = getattr(
            settings,
            "MEN_AUTH_COOKIE_SAMESITE",
            "Lax",
        )

        session_restante = _secondes_restantes_session(refresh)
        reponse.set_cookie(
            "men_access",
            access,
            max_age=_max_age_cookie_access(access, session_restante),
            httponly=True,
            secure=secure,
            samesite=samesite,
            path="/api/",
        )

        reponse.set_cookie(
            "men_refresh",
            refresh,
            max_age=session_restante,
            httponly=True,
            secure=secure,
            samesite=samesite,
            path="/api/auth/session/",
        )

        return reponse


@method_decorator(csrf_protect, name="dispatch")
class RafraichissementSessionCookieView(APIView):
    """Renouvelle les JWT par cookie sans exposer les jetons dans le JSON."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [RafraichissementSessionThrottle]

    def post(self, request):
        refresh_cookie = request.COOKIES.get("men_refresh")

        if not refresh_cookie:
            return _reponse_session_expiree()

        serializer = SessionLimiteeTokenRefreshSerializer(
            data={"refresh": refresh_cookie},
        )

        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken, TypeError, ValueError):
            return _reponse_session_expiree()

        jetons = serializer.validated_data
        access = jetons["access"]
        refresh = jetons.get("refresh", refresh_cookie)
        session_restante = _secondes_restantes_session(refresh)
        if session_restante <= 0:
            return _reponse_session_expiree()

        secure = getattr(
            settings,
            "MEN_AUTH_COOKIE_SECURE",
            settings.CSRF_COOKIE_SECURE,
        )
        samesite = getattr(
            settings,
            "MEN_AUTH_COOKIE_SAMESITE",
            "Lax",
        )

        reponse = Response(
            {"detail": "Session renouvelée."},
            status=status.HTTP_200_OK,
        )

        reponse.set_cookie(
            "men_access",
            access,
            max_age=_max_age_cookie_access(access, session_restante),
            httponly=True,
            secure=secure,
            samesite=samesite,
            path="/api/",
        )

        reponse.set_cookie(
            "men_refresh",
            refresh,
            max_age=session_restante,
            httponly=True,
            secure=secure,
            samesite=samesite,
            path="/api/auth/session/",
        )

        return reponse


@method_decorator(csrf_protect, name="dispatch")
class DeconnexionSessionCookieView(APIView):
    """Déconnecte la session navigateur et révoque le jeton de renouvellement.

    La déconnexion reste disponible même après l'expiration du jeton d'accès ;
    la protection CSRF reste obligatoire et les cookies sont toujours effacés.
    """

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        refresh_cookie = request.COOKIES.get("men_refresh")

        if refresh_cookie:
            try:
                RefreshToken(refresh_cookie).blacklist()
            except (TokenError, TypeError, ValueError):
                pass

        secure = getattr(
            settings,
            "MEN_AUTH_COOKIE_SECURE",
            settings.CSRF_COOKIE_SECURE,
        )
        samesite = getattr(
            settings,
            "MEN_AUTH_COOKIE_SAMESITE",
            "Lax",
        )

        reponse = Response(
            status=status.HTTP_205_RESET_CONTENT,
        )

        reponse.set_cookie(
            "men_access",
            "",
            max_age=0,
            httponly=True,
            secure=secure,
            samesite=samesite,
            path="/api/",
        )

        reponse.set_cookie(
            "men_refresh",
            "",
            max_age=0,
            httponly=True,
            secure=secure,
            samesite=samesite,
            path="/api/auth/session/",
        )

        return reponse


class ConnexionView(TokenObtainPairView):
    """Connexion historique : access, refresh et profil utilisateur."""

    serializer_class = ConnexionSerializer
    throttle_classes = [ConnexionParMinuteThrottle, ConnexionParHeureThrottle]


class RafraichissementJWTView(TokenRefreshView):
    """Renouvellement historique soumis à la même limite absolue de session."""

    serializer_class = SessionLimiteeTokenRefreshSerializer
    throttle_classes = [RafraichissementSessionThrottle]


class DeconnexionView(APIView):
    """Révoque un jeton de renouvellement transmis dans le corps JSON."""

    def post(self, request):
        try:
            refresh = request.data.get("refresh")

            if not refresh:
                raise TokenError("Jeton absent.")

            RefreshToken(refresh).blacklist()

        except (TokenError, TypeError, ValueError):
            return Response(
                {
                    "detail": "Jeton de rafraîchissement invalide.",
                    "erreurs": {},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            status=status.HTTP_205_RESET_CONTENT,
        )


class MoiView(generics.RetrieveAPIView):
    """Retourne le profil du compte connecté."""

    serializer_class = UtilisateurSerializer

    def get_object(self):
        return self.request.user


class ChangementMotDePasseView(APIView):
    """Permet à l'utilisateur connecté de changer son mot de passe."""

    def post(self, request):
        serializer = ChangementMotDePasseSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        request.user.set_password(
            serializer.validated_data["nouveau_mot_de_passe"],
        )
        request.user.save()

        return Response(
            {"detail": "Mot de passe modifié."},
        )


class PersonnelViewSet(viewsets.ModelViewSet):
    """Fiches du personnel : lecture selon le périmètre, écriture RH et administrateur."""

    serializer_class = PersonnelSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        EstRHOuLectureSeule,
    ]

    filterset_fields = [
        "direction",
        "service",
        "statut",
        "sexe",
    ]

    search_fields = [
        "im",
        "cin",
        "nom",
        "prenoms",
    ]

    ordering_fields = [
        "nom",
        "im",
    ]

    def get_queryset(self):
        return (
            Personnel.objects
            .select_related("direction", "service")
            .filter(
                filtre_perimetre(
                    self.request.user,
                    prefixe="",
                )
            )
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

        personnel = self.get_queryset().filter(
            im__iexact=im,
        ).first()

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

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )


class UtilisateurAdminViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Gestion des comptes liés au personnel, réservée à l'administrateur."""

    serializer_class = UtilisateurAdministrationSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        EstAdmin,
    ]

    filter_backends = [
        filters.SearchFilter,
        filters.OrderingFilter,
    ]

    filterset_fields = [
        "role",
        "is_active",
    ]

    search_fields = [
        "username",
        "email",
        "personnel__im",
        "personnel__nom",
        "personnel__prenoms",
    ]

    ordering_fields = [
        "username",
        "email",
        "role",
        "is_active",
        "last_login",
    ]

    ordering = [
        "personnel__nom",
        "personnel__prenoms",
    ]

    def get_queryset(self):
        """Expose uniquement les comptes ordinaires liés au personnel."""

        return (
            Utilisateur.objects
            .filter(personnel__isnull=False)
            .exclude(role=Role.ADMIN)
            .select_related(
                "personnel",
                "personnel__direction",
                "personnel__service",
            )
        )