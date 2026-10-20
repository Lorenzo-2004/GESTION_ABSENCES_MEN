from django.contrib import admin

from .models import DecisionConge, DemandeAbsence, SoldeConge, ValidationWorkflow


@admin.register(SoldeConge)
class SoldeCongeAdmin(admin.ModelAdmin):
    list_display = ("personnel", "annee", "droit_annuel", "jours_pris", "solde_restant")
    list_filter = ("annee",)
    search_fields = ("personnel__im", "personnel__nom")


@admin.register(DecisionConge)
class DecisionCongeAdmin(admin.ModelAdmin):
    list_display = ("numero_decision", "personnel", "annees_titre", "date_emission", "est_valide")
    list_filter = ("est_valide", "direction")
    search_fields = ("numero_decision", "personnel__im", "personnel__nom")


class ValidationInline(admin.TabularInline):
    model = ValidationWorkflow
    extra = 0
    readonly_fields = ("date_action",)


@admin.register(DemandeAbsence)
class DemandeAbsenceAdmin(admin.ModelAdmin):
    list_display = ("numero_enregistrement", "personnel", "type_absence", "date_debut", "date_fin", "nombre_jours", "statut_demande")
    list_filter = ("type_absence", "statut_demande")
    search_fields = ("numero_enregistrement", "personnel__im", "personnel__nom")
    inlines = [ValidationInline]
