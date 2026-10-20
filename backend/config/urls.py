"""Routage de l'API REST (CDC §5.1).

Toutes les routes métier vivent sous `/api/`. L'authentification est assurée par
des jetons JWT (en-tête `Authorization: Bearer <access>`).
"""

from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("personnels.urls")),
    path("api/", include("organisation.urls")),
    path("api/", include("conges.urls")),
]
