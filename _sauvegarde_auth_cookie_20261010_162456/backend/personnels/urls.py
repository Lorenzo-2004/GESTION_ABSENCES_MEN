from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

router = DefaultRouter()
router.register("personnels", views.PersonnelViewSet, basename="personnel")

urlpatterns = [
    path("auth/connexion/", views.ConnexionView.as_view(), name="connexion"),
    path("auth/rafraichir/", TokenRefreshView.as_view(), name="rafraichir"),
    path("auth/deconnexion/", views.DeconnexionView.as_view(), name="deconnexion"),
    path("auth/moi/", views.MoiView.as_view(), name="moi"),
    path("auth/mot-de-passe/", views.ChangementMotDePasseView.as_view(), name="mot-de-passe"),
    *router.urls,
]
