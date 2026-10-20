from django.middleware.csrf import CsrfViewMiddleware

from rest_framework.authentication import CSRFCheck
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication


class CookieJWTAuthentication(JWTAuthentication):
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