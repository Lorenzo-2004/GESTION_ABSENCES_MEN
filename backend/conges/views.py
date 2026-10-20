"""Vues de l'API « congés » (CDC §3.2 et §5.1).

Chaque action écriture délègue aux services métier (`conges.services`), qui
portent les règles RG-01 à RG-10. Les vues ne font que : contrôler les droits,
appeler le service, sérialiser le résultat.
"""

from django.db import models, transaction
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404  # noqa: F401 - réexporté pour la vue de téléchargement
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone

from commun.permissions import (
    APersonnelLie,
    EstRH,
    EstValideur,
    filtre_perimetre,
    personnel_de,
    role_de,
)
from personnels.enums import Role

from .models import DecisionConge, DemandeAbsence, SoldeConge
from .serializers import (
    AvisSerializer,
    DecisionCongeSerializer,
    DemandeAbsenceSerializer,
    DemandeAbsenceSoumissionSerializer,
    PlanningEquipeSerializer,
    ScanDecisionSerializer,
    SoldeCongeSerializer,
)
from .services import soldes as services_soldes


class DemandeAbsenceViewSet(viewsets.ModelViewSet):
    """Demandes d'absence : création par l'agent, consultation selon le périmètre."""

    queryset = DemandeAbsence.objects.select_related("personnel", "personnel__direction")
    permission_classes = [permissions.IsAuthenticated]
    # Une demande ne se modifie ni ne se supprime : elle se crée, se consulte, se vise,
    # ou s'annule (action `annuler`). Cela protège les demandes validées et le solde.
    http_method_names = ["get", "post", "head", "options"]
    filterset_fields = ["type_absence", "statut_demande", "personnel"]
    search_fields = ["numero_enregistrement", "personnel__im", "personnel__nom"]
    ordering_fields = ["date_creation", "date_debut", "statut_demande"]

    def get_queryset(self):
        # RG-17 : le Directeur dispose d'une vue consolidée de tous les formulaires
        # et demandes, même si ses actions de validation restent limitées par le service.
        base = super().get_queryset()
        if role_de(self.request.user) == Role.DIRECTEUR:
            return base
        return base.filter(filtre_perimetre(self.request.user))

    @transaction.atomic
    def perform_create(self, serializer):
        """Crée la demande pour l'agent connecté puis applique les règles de soumission.

        La conception (useCase UC_SaisieChef_Delegated) autorise un chef de service à
        saisir une demande pour un agent de son service : dans ce cas le champ
        `personnel` fourni par le client est honoré après contrôle du périmètre.
        """
        from .services.demandes import soumettre_demande

        # La transaction doit commencer AVANT serializer.save(). Le service de
        # soumission valide les règles après la création : sans cette transaction
        # externe, une ValidationError laisserait une demande invalide en base.
        cible = self._personnel_cible(serializer.validated_data.pop("personnel", None))
        demande = serializer.save(personnel=cible)
        soumettre_demande(demande)
        serializer.instance = demande

    def _personnel_cible(self, personnel_demande):
        """Détermine pour qui la demande est créée, en appliquant le périmètre autorisé."""
        demandeur = personnel_de(self.request.user)
        if demandeur is None:
            raise PermissionDenied("Votre compte n'est lié à aucune fiche personnel.")

        if personnel_demande is None or personnel_demande.pk == demandeur.pk:
            return demandeur

        # Saisie déléguée : réservée au chef de service, pour ses agents.
        if role_de(self.request.user) == Role.CHEF_SERVICE:
            if personnel_demande.service_id == demandeur.service_id:
                return personnel_demande
            raise PermissionDenied("Cet agent n'appartient pas à votre service.")
        if role_de(self.request.user) in (Role.RH, Role.ADMIN):
            return personnel_demande

        raise PermissionDenied("Vous ne pouvez saisir une demande que pour vous-même.")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return DemandeAbsenceSoumissionSerializer
        return DemandeAbsenceSerializer

    def _verifier_proprietaire_en_cours(self, demande):
        """Seul le demandeur peut annuler sa demande, tant qu'elle est en circuit."""
        from .regles import STATUTS_EN_COURS

        if demande.personnel_id != getattr(personnel_de(self.request.user), "pk", None):
            raise PermissionDenied("Vous ne pouvez agir que sur vos propres demandes.")
        if demande.statut_demande not in STATUTS_EN_COURS:
            raise ValidationError("Cette demande n'est plus modifiable (circuit terminé).")

    @action(detail=False, methods=["get"], permission_classes=[EstValideur],
            url_path="en-attente-service")
    def en_attente_service(self, request):
        """Demandes du service du chef en attente de son visa (diagramme sequence2, étape 1)."""
        from .enums import StatutDemande

        personnel = personnel_de(request.user)
        if role_de(request.user) not in (Role.CHEF_SERVICE, Role.RH):
            raise PermissionDenied("Réservé au chef de service ou au responsable RH de service.")
        if personnel is None or personnel.service_id is None:
            raise PermissionDenied("Votre compte n'est associé à aucun service.")

        requete = (
            DemandeAbsence.objects.select_related("personnel")
            .filter(
                statut_demande=StatutDemande.EN_ATTENTE,
                personnel__service_id=personnel.service_id,
            )
            .exclude(personnel_id=personnel.pk)
            .exclude(personnel__compte__role__in=(Role.CHEF_SERVICE, Role.RH))
        )
        return Response(DemandeAbsenceSerializer(requete, many=True).data)

    @action(detail=False, methods=["get"], permission_classes=[EstValideur],
            url_path="en-attente-direction")
    def en_attente_direction(self, request):
        """Demandes à signer par le directeur : visées par un chef, ou directes (RG-10)."""
        from .enums import StatutDemande

        if role_de(request.user) != Role.DIRECTEUR:
            raise PermissionDenied("Réservé au directeur.")

        requete = (
            DemandeAbsence.objects.select_related("personnel")
            .filter(filtre_perimetre(request.user))
            .filter(
                models.Q(statut_demande=StatutDemande.APPROUVE_CS)
                | models.Q(
                    statut_demande=StatutDemande.EN_ATTENTE,
                    personnel__compte__role__in=(Role.CHEF_SERVICE, Role.RH),
                )
            )
            .distinct()
        )
        return Response(DemandeAbsenceSerializer(requete, many=True).data)

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated],
            url_path="planning")
    def planning(self, request):
        """Planning d'équipe : absences occupant le calendrier (useCase UC_Planning)."""
        from .regles import STATUTS_OCCUPANTS

        base = DemandeAbsence.objects.select_related("personnel").filter(
            statut_demande__in=STATUTS_OCCUPANTS
        )
        if role_de(request.user) == Role.RH:
            personnel = personnel_de(request.user)
            if personnel is None or personnel.service_id is None:
                raise PermissionDenied("Votre compte RH n'est associé à aucun service.")
            requete = base.filter(personnel__service_id=personnel.service_id)
        else:
            requete = base.filter(filtre_perimetre(request.user))

        debut = request.query_params.get("debut")
        fin = request.query_params.get("fin")
        if debut and fin:
            requete = requete.filter(date_debut__lte=fin, date_fin__gte=debut)

        donnees = [
            {
                "id_demande": d.pk,
                "personnel_id": d.personnel_id,
                "personnel_nom": d.personnel.nom_complet,
                "type_absence": d.type_absence,
                "type_absence_libelle": d.get_type_absence_display(),
                "date_debut": d.date_debut,
                "date_fin": d.date_fin,
                "nombre_jours": d.nombre_jours,
                "statut_demande": d.statut_demande,
            }
            for d in requete
        ]
        return Response(PlanningEquipeSerializer(donnees, many=True).data)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def annuler(self, request, pk=None):
        """L'agent annule sa propre demande encore en circuit."""
        from .enums import StatutDemande

        demande = self.get_object()
        self._verifier_proprietaire_en_cours(demande)
        demande.statut_demande = StatutDemande.REJETE
        demande.save(update_fields=["statut_demande"])
        return Response(DemandeAbsenceSerializer(demande).data)

    @action(detail=True, methods=["post"], permission_classes=[EstValideur])
    def avis(self, request, pk=None):
        """Visa du chef de service ou décision du directeur (RG-07, RG-10)."""
        from .services.validation import enregistrer_avis

        demande = self.get_object()
        corps = AvisSerializer(data=request.data)
        corps.is_valid(raise_exception=True)

        enregistrer_avis(
            demande=demande,
            valideur=personnel_de(request.user),
            avis=corps.validated_data["avis"],
            observation=corps.validated_data.get("observation", ""),
        )
        demande.refresh_from_db()
        return Response(DemandeAbsenceSerializer(demande).data)

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated],
            url_path="justificatif")
    def deposer_justificatif(self, request, pk=None):
        """Dépose la pièce justificative (RG-08) sur sa propre demande."""
        from .services.demandes import joindre_justificatif

        demande = self.get_object()
        if demande.personnel_id != getattr(personnel_de(request.user), "pk", None):
            raise PermissionDenied("Vous ne pouvez joindre un justificatif qu'à vos demandes.")
        fichier = request.FILES.get("fichier")
        joindre_justificatif(demande, fichier)
        return Response(DemandeAbsenceSerializer(demande).data)

    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated],
            url_path="justificatif/telecharger")
    def telecharger_justificatif(self, request, pk=None):
        """Sert la pièce justificative via une vue authentifiée (jamais via le serveur web)."""
        demande = self.get_object()
        if not demande.fichier_justificatif:
            raise Http404("Aucun justificatif pour cette demande.")
        return FileResponse(
            demande.fichier_justificatif.open("rb"),
            as_attachment=True,
            filename=demande.fichier_justificatif.name.rsplit("/", 1)[-1],
        )

    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def formulaire(self, request, pk=None):
        """Formulaire officiel pré-rempli (PDF, CDC objectif 3)."""
        from .services.pdf import generer_formulaire_pdf

        demande = self.get_object()
        flux = generer_formulaire_pdf(demande)
        nom = f"formulaire-{demande.numero_enregistrement or demande.pk}.pdf"
        return FileResponse(flux, as_attachment=True, filename=nom, content_type="application/pdf")


class AValiderViewSet(viewsets.ViewSet):
    """File d'attente du valideur : demandes qui attendent SON intervention."""

    permission_classes = [permissions.IsAuthenticated, EstValideur]

    def list(self, request):
        from .enums import StatutDemande

        personnel = personnel_de(request.user)
        role = role_de(request.user)
        requete = DemandeAbsence.objects.select_related("personnel").filter(
            filtre_perimetre(request.user)
        )

        if role in (Role.CHEF_SERVICE, Role.RH):
            if personnel is None or personnel.service_id is None:
                raise PermissionDenied("Votre compte n'est associé à aucun service.")
            requete = requete.filter(
                statut_demande=StatutDemande.EN_ATTENTE,
                personnel__service_id=personnel.service_id,
            ).exclude(personnel_id=personnel.pk).exclude(
                personnel__compte__role__in=(Role.CHEF_SERVICE, Role.RH)
            )
        else:  # directeur : décisions en attente dans sa direction (RG-10 compris)
            requete = requete.filter(
                models.Q(statut_demande=StatutDemande.APPROUVE_CS)
                | models.Q(
                    statut_demande=StatutDemande.EN_ATTENTE,
                    personnel__compte__role__in=(Role.CHEF_SERVICE, Role.RH),
                )
            )

        return Response(DemandeAbsenceSerializer(requete.distinct(), many=True).data)


class DecisionCongeViewSet(viewsets.ModelViewSet):
    """Décisions annuelles : consultation et gestion réservées à la RH/admin."""

    queryset = DecisionConge.objects.select_related("personnel", "direction")
    serializer_class = DecisionCongeSerializer
    # Les décisions contiennent des données administratives individuelles.
    # Contrairement aux fiches personnel, elles ne sont pas en lecture libre :
    # liste, détail et écritures sont réservés à la RH et à l'administrateur.
    permission_classes = [permissions.IsAuthenticated, EstRH]
    filterset_fields = ["personnel", "direction", "est_valide", "nature"]
    search_fields = ["numero_decision", "personnel__im", "personnel__nom"]

    @action(detail=True, methods=["post"], permission_classes=[EstRH])
    def activer(self, request, pk=None):
        """Valide la décision et ouvre les soldes des années concernées."""
        decision = self.get_object()
        services_soldes.valider_et_activer_par_rh(decision)
        decision.refresh_from_db()
        return Response(DecisionCongeSerializer(decision).data)

    # Alias du diagramme de séquence 1 : confirmer = valider & activer la décision.
    @action(detail=True, methods=["post"], permission_classes=[EstRH])
    def confirmer(self, request, pk=None):
        return self.activer(request, pk=pk)
    
    @action(
        detail=False,
        methods=["post"],
        permission_classes=[permissions.IsAuthenticated, EstRH],
        url_path="reporter-reliquats",
    )
    def reporter_reliquats(self, request):
        """Reporte les reliquats d'un exercice clôturé vers l'année suivante."""

        valeur = request.data.get("annee_source")

        try:
            annee_source = int(valeur)
        except (TypeError, ValueError):
            raise ValidationError({
                "annee_source": "Une année source valide est obligatoire."
            })

        annee_courante = timezone.localdate().year

        if annee_source < 1900 or annee_source >= annee_courante:
            raise ValidationError({
                "annee_source": (
                    "Le report concerne uniquement un exercice antérieur "
                    "à l'année en cours."
                )
            })

        soldes_reportes = services_soldes.reporter_reliquats(
            annee_source
        )

        return Response({
            "annee_source": annee_source,
            "annee_cible": annee_source + 1,
            "nombre_soldes_reportes": len(soldes_reportes),
            "message": "Report des reliquats effectué.",
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], permission_classes=[EstRH], url_path="scan")
    def scan(self, request):
        """Extrait par OCR les données d'un scan de décision, sans rien enregistrer.

        Répond avec les champs reconnus et, si l'IM correspond à un agent connu, ses
        informations — ce qui permet à la RH de vérifier avant de confirmer (sequence1).
        """
        from .services.ocr import extraire_donnees_decision

        corps = ScanDecisionSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        extrait = extraire_donnees_decision(corps.validated_data["fichier"])

        agent = None
        if extrait.get("im"):
            from personnels.models import Personnel

            trouve = Personnel.objects.filter(im=extrait["im"]).first()
            if trouve is not None:
                from personnels.serializers import PersonnelSerializer

                agent = PersonnelSerializer(trouve).data

        return Response(
            {
                "donnees_extraites": extrait,
                "agent": agent,
                "statut_agent": agent["statut"] if agent else None,
                "nature": extrait.get("source"),
            }
        )


class SoldeCongeViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Soldes de congé annuel : lecture seule, filtrée par périmètre (RG-06)."""

    serializer_class = SoldeCongeSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["personnel", "annee"]
    ordering_fields = ["annee", "solde_restant"]

    def get_queryset(self):
        return SoldeConge.objects.select_related("personnel").filter(
            filtre_perimetre(self.request.user)
        )


class MesDroitsView(APIView):
    """Synthèse des droits de congé annuel du compte connecté, pour une année."""

    permission_classes = [permissions.IsAuthenticated, APersonnelLie]

    def get(self, request):
        from django.utils import timezone

        annee = int(request.query_params.get("annee", timezone.localdate().year))
        droits = services_soldes.droits_annuels_du_personnel(personnel_de(request.user), annee)
        return Response(droits)


class ValidationsView(APIView):
    """Point d'entrée unique du circuit d'avis (diagramme sequence2).

    `POST /api/validations/ {demande, avis, observation}` enregistre le visa du
    chef de service ou la décision du directeur, selon le rôle du compte connecté.
    """

    permission_classes = [permissions.IsAuthenticated, EstValideur]

    def post(self, request):
        from .services.validation import enregistrer_avis

        id_demande = request.data.get("demande") or request.data.get("id_demande")
        if not id_demande:
            raise ValidationError({"demande": "L'identifiant de la demande est obligatoire."})

        demande = get_object_or_404(DemandeAbsence, pk=id_demande)
        if not DemandeAbsence.objects.filter(
            pk=demande.pk
        ).filter(filtre_perimetre(request.user)).exists():
            raise PermissionDenied("Cette demande n'appartient pas à votre périmètre.")

        corps = AvisSerializer(data=request.data)
        corps.is_valid(raise_exception=True)

        enregistrer_avis(
            demande=demande,
            valideur=personnel_de(request.user),
            avis=corps.validated_data["avis"],
            observation=corps.validated_data.get("observation", ""),
        )
        demande.refresh_from_db()
        return Response(DemandeAbsenceSerializer(demande).data)