from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("demandes", views.DemandeAbsenceViewSet, basename="demande")
router.register("decisions", views.DecisionCongeViewSet, basename="decision")
router.register("soldes", views.SoldeCongeViewSet, basename="solde")
router.register("a-valider", views.AValiderViewSet, basename="a-valider")

urlpatterns = [
    path("mes-droits/", views.MesDroitsView.as_view(), name="mes-droits"),
    path("validations/", views.ValidationsView.as_view(), name="validations"),
    *router.urls,
]
