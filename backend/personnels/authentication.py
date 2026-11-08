from datetime import timedelta

from django.conf import settings
from django.middleware.csrf import CsrfViewMiddleware
from django.utils import timezone

from rest_framework.authentication import CSRFCheck
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication


class SessionLimiteeJWTAuthentication(JWTAuthentication):
    """Refuse les jetons d'accès issus d'une session ayant dépassé sa durée absolue."""

    def get_user(self, validated_token):
        debut_session = validated_token.get("session_started", validated_token.get("iat"))
        maintenant = int(timezone.now().timestamp())
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
            raise AuthenticationFailed(
                "Votre session a expiré. Veuillez vous reconnecter.",
                code="session_expiree",
            )
        return super().get_user(validated_token)


class CookieJWTAuthentication(SessionLimiteeJWTAuthentication):
    """
    Authentifie les requêtes avec le cookie HttpOnly men_access.

    Si le cookie est absent, laisse les authentificateurs suivants
    gérer la requête, notamment l'authentification Bearer historique.

    Si le cookie est présent mais invalide, refuse la requête sans
    basculer vers le jeton Bearer.
    """

    def authenticate(self, request):
        raw_token = request.COOKIES.get("men_access")

        # Aucun cookie : l'authentification Bearer reste disponible.
        if raw_token is None:
            return None

        # Un cookie présent mais invalide provoquera une erreur
        # d'authentification, sans repli vers le jeton Bearer.
        validated_token = self.get_validated_token(raw_token)
        user = self.get_user(validated_token)

        # Le CSRF est obligatoire lorsque l'authentification utilise
        # le cookie pour une requête qui modifie des données.
        self.enforce_csrf(request)

        return user, validated_token

    def enforce_csrf(self, request):
        check = CSRFCheck(lambda req: None)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})

        if reason:
            raise PermissionDenied(f"Échec de la vérification CSRF : {reason}")