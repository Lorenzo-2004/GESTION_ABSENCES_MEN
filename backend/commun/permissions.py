"""Contrôle d'accès par rôle et isolation des données."""

from django.db.models import Q

from rest_framework.permissions import SAFE_METHODS, BasePermission

from personnels.enums import Role


# Rôles ayant accès à la gestion ministérielle des données.
ROLES_GESTION = (Role.RH, Role.ADMIN)


def role_de(user):
    """Retourne le rôle d'un utilisateur authentifié."""
    return getattr(user, "role", None) if user and user.is_authenticated else None


def personnel_de(user):
    """Retourne la fiche personnel associée à l'utilisateur."""
    return (
        getattr(user, "personnel", None)
        if user and user.is_authenticated
        else None
    )


def filtre_perimetre(user, prefixe="personnel"):
    """Construit un filtre Q correspondant au périmètre de visibilité.

    prefixe="personnel" pour une demande.
    prefixe="" pour une fiche Personnel.
    """
    chemin = f"{prefixe}__" if prefixe else ""
    cle_pk = f"{prefixe}" if prefixe else "pk"
    role = role_de(user)

    # RH et administrateur : périmètre ministériel.
    if role in ROLES_GESTION:
        return Q()

    personnel = personnel_de(user)

    if personnel is None:
        return Q(pk__in=[])

    # Directeur : toute sa direction.
    if role == Role.DIRECTEUR:
        return Q(**{f"{chemin}direction_id": personnel.direction_id})

    # Chef de service : son service et ses propres données.
    if role == Role.CHEF_SERVICE and personnel.service_id:
        return (
            Q(**{f"{chemin}service_id": personnel.service_id})
            | Q(**{cle_pk: personnel.pk})
        )

    # Par défaut, l'agent ne voit que ses propres données.
    return Q(**{cle_pk: personnel.pk})


class EstRH(BasePermission):
    """Autorise les rôles RH et administrateur."""

    message = "Action réservée aux ressources humaines ou à l'administrateur."

    def has_permission(self, request, view):
        return role_de(request.user) in ROLES_GESTION


class EstRHOuLectureSeule(BasePermission):
    """Lecture pour tout utilisateur connecté, écriture pour la RH ou l'admin."""

    message = (
        "Seules les ressources humaines ou l'administrateur "
        "peuvent modifier ces données."
    )

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        return (
            request.method in SAFE_METHODS
            or role_de(request.user) in ROLES_GESTION
        )


class EstAdminOuLectureSeule(BasePermission):
    """Lecture pour tout utilisateur connecté, écriture pour l'administrateur."""

    message = "Seul l'administrateur peut modifier la structure organisationnelle."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        return (
            request.method in SAFE_METHODS
            or role_de(request.user) == Role.ADMIN
        )


class EstAdmin(BasePermission):
    """Réserve la gestion des comptes à l'administrateur."""

    message = "Accès réservé à l'administrateur."

    def has_permission(self, request, view):
        user = request.user

        return bool(
            user
            and user.is_authenticated
            and (
                user.is_superuser
                or role_de(user) == Role.ADMIN
            )
        )


MSG_SANS_SERVICE = (
    "Votre fiche personnel n'est rattachée à aucun service : "
    "demandez à l'administrateur de vous en affecter un."
)


class EstValideur(BasePermission):
    """Autorise les chefs de service, les RH et les directeurs ayant une fiche personnel.

    Le rattachement à un service n'est volontairement pas exigé ici : il est contrôlé
    par chaque vue, qui renvoie alors un message précis (ou une liste vide pour la RH)
    au lieu d'un refus générique qui accuse à tort le rôle du compte.
    """

    message = (
        "Action réservée au chef de service, au responsable RH ou au directeur "
        "dont le compte est lié à une fiche personnel."
    )

    def has_permission(self, request, view):
        role = role_de(request.user)
        if role in (Role.DIRECTEUR, Role.CHEF_SERVICE, Role.RH):
            return personnel_de(request.user) is not None
        return False


class APersonnelLie(BasePermission):
    """Vérifie que le compte possède une fiche personnel."""

    message = "Votre compte n'est lié à aucune fiche personnel."

    def has_permission(self, request, view):
        return personnel_de(request.user) is not None