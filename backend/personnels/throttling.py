"""Limites de débit dédiées à l'authentification MEN."""

from rest_framework.throttling import AnonRateThrottle


class ConnexionParMinuteThrottle(AnonRateThrottle):
    """Limite les tentatives de connexion depuis une même adresse IP."""

    scope = "connexion_minute"


class ConnexionParHeureThrottle(AnonRateThrottle):
    """Deuxième fenêtre anti-brute-force, indépendante de la limite par minute."""

    scope = "connexion_heure"


class RafraichissementSessionThrottle(AnonRateThrottle):
    """Protège le renouvellement des jetons sans limiter les connexions normales."""

    scope = "session_refresh"
