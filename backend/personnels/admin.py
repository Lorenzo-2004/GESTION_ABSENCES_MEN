from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Personnel, Utilisateur


@admin.register(Personnel)
class PersonnelAdmin(admin.ModelAdmin):
    list_display = ("im", "nom", "prenoms", "statut", "direction", "service")
    list_filter = ("statut", "direction", "service")
    search_fields = ("im", "cin", "nom", "prenoms")


@admin.register(Utilisateur)
class UtilisateurAdmin(UserAdmin):
    list_display = ("username", "role", "personnel", "is_active")
    list_filter = ("role", "is_active")
    fieldsets = UserAdmin.fieldsets + (("Rôle MEN", {"fields": ("role", "personnel")}),)
    add_fieldsets = UserAdmin.add_fieldsets + (
        ("Rôle MEN", {"fields": ("role", "personnel")}),
    )
