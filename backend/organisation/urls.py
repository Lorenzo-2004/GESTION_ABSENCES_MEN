from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("directions", views.DirectionViewSet, basename="direction")
router.register("services", views.ServiceViewSet, basename="service")

urlpatterns = router.urls
