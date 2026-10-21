from django.contrib import admin

from .models import DecisionConge, DemandeAbsence, SoldeConge, TraceSignature, ValidationWorkflow


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


@admin.register(TraceSignature)
class TraceSignatureAdmin(admin.ModelAdmin):
    list_display = ("id_trace", "demande", "evenement", "date_evenement", "acteur_identifiant", "empreinte_evenement")
    list_filter = ("evenement", "date_evenement")
    search_fields = ("demande__numero_enregistrement", "demande__personnel__im", "acteur_identifiant")
    readonly_fields = tuple(field.name for field in TraceSignature._meta.fields)
    ordering = ("-date_evenement",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
