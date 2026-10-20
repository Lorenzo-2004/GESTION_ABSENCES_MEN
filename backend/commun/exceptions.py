"""Formatage uniforme des erreurs de l'API (CDC §5.1).

Les règles de gestion lèvent des `ValidationError` Django, parfois avec un
simple message, parfois avec un dictionnaire « champ → message(s) ». Le
frontend doit recevoir la même enveloppe dans tous les cas :

    {
        "detail": "message lisible",
        "erreurs": {"champ": ["message", ...]}
    }
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


def _convertir_validation_django(exc):
    """Traduit une ValidationError Django (couche services) en ValidationError DRF."""
    if hasattr(exc, "error_dict"):
        return DRFValidationError(exc.message_dict)
    return DRFValidationError({"detail": exc.messages})


def _normaliser_erreurs(donnees):
    """Ramène toute forme d'erreur DRF à un dictionnaire « champ → liste de textes »."""
    if isinstance(donnees, dict):
        return {cle: _normaliser_erreurs(valeur) for cle, valeur in donnees.items()}
    if isinstance(donnees, (list, tuple)):
        return [element if isinstance(element, str) else str(element) for element in donnees]
    return [str(donnees)]


def gestionnaire_exceptions(exc, context):
    """Enveloppe chaque erreur dans une réponse {detail, erreurs} homogène."""
    if isinstance(exc, DjangoValidationError):
        exc = _convertir_validation_django(exc)
    elif isinstance(exc, ProtectedError):
        return Response(
            {
                "detail": "Suppression impossible : cet élément est référencé par d'autres données.",
                "erreurs": {},
            },
            status=status.HTTP_409_CONFLICT,
        )

    reponse = drf_exception_handler(exc, context)

    if reponse is None:
        # Exception non gérée par DRF : on laisse Django produire la 500.
        return None

    donnees = reponse.data

    if isinstance(donnees, dict) and set(donnees.keys()) == {"detail"}:
        brut = donnees["detail"]
        detail = " ".join(str(m) for m in brut) if isinstance(brut, (list, tuple)) else str(brut)
        erreurs = {}
    else:
        erreurs = _normaliser_erreurs(donnees)
        detail = "Les données transmises sont invalides."

    reponse.data = {"detail": detail, "erreurs": erreurs}

    if reponse.status_code == status.HTTP_403_FORBIDDEN and not detail:
        reponse.data["detail"] = "Vous n'avez pas les droits pour effectuer cette action."

    return reponse
