from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views


router = DefaultRouter()

router.register(
    "personnels",
    views.PersonnelViewSet,
    basename="personnel",
)

router.register(
    "utilisateurs",
    views.UtilisateurAdminViewSet,
    basename="utilisateur-admin",
)


urlpatterns = [
    # Initialisation CSRF
    path(
        "auth/csrf/",
        views.InitialisationCSRFView.as_view(),
        name="csrf",
    ),

    # Authentification
    path(
        "auth/connexion/",
        views.ConnexionView.as_view(),
        name="connexion",
    ),
    path(
        "auth/session/connexion/",
        views.ConnexionSessionView.as_view(),
        name="session-connexion",
    ),
    path(
        "auth/session/rafraichir/",
        views.RafraichissementSessionCookieView.as_view(),
        name="session-rafraichir",
    ),
    path(
        "auth/session/deconnexion/",
        views.DeconnexionSessionCookieView.as_view(),
        name="session-deconnexion",
    ),
    path(
        "auth/rafraichir/",
        views.RafraichissementJWTView.as_view(),
        name="rafraichir",
    ),
    path(
        "auth/deconnexion/",
        views.DeconnexionView.as_view(),
        name="deconnexion",
    ),
    path(
        "auth/moi/",
        views.MoiView.as_view(),
        name="moi",
    ),
    path(
        "auth/mot-de-passe/",
        views.ChangementMotDePasseView.as_view(),
        name="mot-de-passe",
    ),

    # Routes des API
    *router.urls,
]