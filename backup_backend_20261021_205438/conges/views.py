"""Vues de l'API « congés » (CDC §3.2 et §5.1).

Chaque action écriture délègue aux services métier (`conges.services`), qui
portent les règles RG-01 à RG-10. Les vues ne font que : contrôler les droits,
appeler le service, sérialiser le résultat.
"""

import hashlib
from io import BytesIO

from django.core.files.base import ContentFile
from django.db import models, transaction
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404  # noqa: F401 - réexporté pour la vue de téléchargement
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone

from commun.permissions import (
    APersonnelLie,
    EstRH,
    MSG_SANS_SERVICE,
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


class DocumentIntegrityConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = (
        "Le document enregistré ne peut pas être confirmé comme intact. "
        "Contactez le service gestionnaire avant de le réutiliser."
    )
    default_code = "document_integrity_conflict"


class DemandeAbsenceViewSet(viewsets.ModelViewSet):
    """Demandes d'absence : création par l'agent, consultation selon le périmètre."""

    queryset = DemandeAbsence.objects.select_related("personnel", "personnel__direction", "signature_agent_compte")
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
        fichier_signature = serializer.validated_data.get("signature_agent")
        if fichier_signature is None:
            raise ValidationError({"signature_agent": "La signature est obligatoire avant la soumission."})

        position = fichier_signature.tell() if hasattr(fichier_signature, "tell") else 0
        try:
            contenu_signature = fichier_signature.read()
        finally:
            if hasattr(fichier_signature, "seek"):
                fichier_signature.seek(position)
        empreinte = hashlib.sha256(contenu_signature).hexdigest()

        demande = serializer.save(
            personnel=cible,
            date_signature_agent=timezone.now(),
            signature_agent_sha256=empreinte,
            signature_agent_compte=self.request.user,
        )
        try:
            soumettre_demande(demande)
            from .services.signatures import ajouter_trace_signature
            from .models import TraceSignature

            ajouter_trace_signature(
                demande,
                TraceSignature.Evenement.SIGNATURE_AGENT_ENREGISTREE,
                self.request.user,
                signature_sha256=empreinte,
                details={"source": "soumission_nouvelle_demande"},
            )
        except Exception:
            # Le stockage fichiers n'est pas transactionnel : retire le PNG orphelin.
            if demande.signature_agent:
                demande.signature_agent.delete(save=False)
            raise
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
        role = role_de(request.user)
        if role not in (Role.CHEF_SERVICE, Role.RH):
            raise PermissionDenied("Réservé au chef de service ou au responsable RH de service.")
        if personnel.service_id is None:
            # La RH sans service n'a aucune équipe à viser : file vide, pas d'erreur.
            if role == Role.RH:
                return Response([])
            raise PermissionDenied(MSG_SANS_SERVICE)

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
        """Génère une copie officielle unique, la scelle et sert toujours les mêmes octets."""
        from .regles import TYPES_AVEC_FORMULAIRE_OFFICIEL
        from .services.pdf import generer_formulaire_pdf
        from .services.signatures import (
            ajouter_trace_signature,
            sha256_octets,
            verifier_integrite_demande,
        )
        from .models import TraceSignature

        demande_visible = self.get_object()  # applique d'abord le périmètre RBAC
        fichier_cree = None
        demande = demande_visible
        contenu_pdf = b""
        nom = f"formulaire-{demande_visible.numero_enregistrement or demande_visible.pk}.pdf"
        try:
            with transaction.atomic():
                # Verrouille uniquement la demande : éviter le FOR UPDATE sur des jointures
                # externes nullable tout en empêchant deux générations concurrentes.
                demande = DemandeAbsence.objects.select_for_update(of=("self",)).get(
                    pk=demande_visible.pk
                )
                if demande.type_absence not in TYPES_AVEC_FORMULAIRE_OFFICIEL:
                    raise ValidationError({
                        "type_absence": (
                            "La fiche officielle est réservée au congé annuel, à la permission "
                            "et à l'autorisation d'absence. Pour ce type, aucune fiche PDF n'est requise."
                        )
                    })

                if demande.pdf_officiel:
                    with demande.pdf_officiel.storage.open(demande.pdf_officiel.name, "rb") as fichier:
                        contenu_pdf = fichier.read()
                    controle = verifier_integrite_demande(demande)
                    if (
                        controle["document_integrite"] is not True
                        or controle["journal_integrite"] is not True
                        or controle["signature_integrite"] is False
                    ):
                        raise DocumentIntegrityConflict()
                    if not contenu_pdf.startswith(b"%PDF-"):
                        raise DocumentIntegrityConflict()
                else:
                    flux = generer_formulaire_pdf(demande)
                    contenu_pdf = flux.getvalue() if hasattr(flux, "getvalue") else flux.read()
                    if not contenu_pdf.startswith(b"%PDF-"):
                        raise ValidationError("Le formulaire n'a pas pu être généré correctement.")

                    empreinte_pdf = sha256_octets(contenu_pdf)
                    demande.pdf_officiel.save(nom, ContentFile(contenu_pdf), save=False)
                    fichier_cree = demande.pdf_officiel.name
                    demande.pdf_officiel_sha256 = empreinte_pdf
                    demande.pdf_officiel_genere_le = timezone.now()
                    demande.pdf_officiel_genere_par = request.user
                    demande.save(update_fields=[
                        "pdf_officiel", "pdf_officiel_sha256", "pdf_officiel_genere_le",
                        "pdf_officiel_genere_par",
                    ])
                    ajouter_trace_signature(
                        demande,
                        TraceSignature.Evenement.PDF_OFFICIEL_SCELE,
                        request.user,
                        pdf_sha256=empreinte_pdf,
                        details={"nom_document": nom, "taille_octets": len(contenu_pdf)},
                    )
                    demande.refresh_from_db()
                    controle = verifier_integrite_demande(demande)
                    if (
                        controle["document_integrite"] is not True
                        or controle["journal_integrite"] is not True
                        or controle["signature_integrite"] is False
                    ):
                        raise DocumentIntegrityConflict()

                ajouter_trace_signature(
                    demande,
                    TraceSignature.Evenement.PDF_OFFICIEL_TELECHARGE,
                    request.user,
                    pdf_sha256=demande.pdf_officiel_sha256,
                    details={"taille_octets": len(contenu_pdf)},
                )
        except Exception:
            # Si la transaction échoue après écriture du fichier, supprime l'artefact orphelin.
            if fichier_cree:
                try:
                    demande.pdf_officiel.storage.delete(fichier_cree)
                except Exception:
                    pass
            raise

        return FileResponse(
            BytesIO(contenu_pdf),
            as_attachment=True,
            filename=nom,
            content_type="application/pdf",
        )

    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated], url_path="integrite")
    def integrite(self, request, pk=None):
        """Vérifie la signature, le PDF scellé et la chaîne d'audit associée."""
        from .services.signatures import verifier_integrite_demande

        demande = self.get_object()
        resultat = verifier_integrite_demande(demande)
        historique = [
            {
                "evenement": trace.get_evenement_display(),
                "date": trace.date_evenement,
                "acteur": trace.acteur_identifiant,
                "empreinte_evenement": trace.empreinte_evenement,
                "empreinte_pdf": trace.pdf_sha256 or None,
            }
            for trace in demande.traces_signature.order_by("id_trace")
        ]
        resultat["historique"] = historique
        resultat["numero_demande"] = demande.numero_enregistrement
        return Response(resultat)


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
            if personnel.service_id is None:
                if role == Role.RH:
                    return Response([])
                raise PermissionDenied(MSG_SANS_SERVICE)
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
        from django.db.models import Value
        from django.db.models.functions import Replace

        from .services.ocr import extraire_donnees_decision

        corps = ScanDecisionSerializer(data=request.data)
        corps.is_valid(raise_exception=True)
        extrait = extraire_donnees_decision(corps.validated_data["fichier"])

        agent = None
        if extrait.get("im"):
            from personnels.models import Personnel
            from personnels.serializers import PersonnelSerializer

            # L'IM est enregistré avec ou sans espaces/points selon la saisie : on compare
            # donc les chiffres seuls des deux côtés.
            trouve = (
                Personnel.objects.annotate(
                    im_chiffres=Replace(Replace("im", Value(" "), Value("")), Value("."), Value(""))
                )
                .filter(im_chiffres=extrait["im"])
                .first()
            )
            if trouve is not None:
                agent = PersonnelSerializer(trouve).data

        numero = extrait.get("numero_decision")
        return Response(
            {
                "donnees_extraites": extrait,
                "agent": agent,
                "statut_agent": agent["statut"] if agent else None,
                "nature": extrait.get("source"),
                # Le numéro de décision est unique : on prévient la RH avant l'enregistrement.
                "numero_deja_utilise": bool(
                    numero and DecisionConge.objects.filter(numero_decision=numero).exists()
                ),
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