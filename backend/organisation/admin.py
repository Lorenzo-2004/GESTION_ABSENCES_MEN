from django.contrib import admin

from .models import Direction, Service


@admin.register(Direction)
class DirectionAdmin(admin.ModelAdmin):
    list_display = ("code_direction", "nom_direction")
    search_fields = ("code_direction", "nom_direction")


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("code_service", "nom_service", "direction")
    list_filter = ("direction",)
    search_fields = ("code_service", "nom_service")
