"""Pagination commune à toutes les vues de l'API (CDC §5.1).

Le frontend attend une enveloppe stable : le nombre total d'éléments et la
structure des comptes rendus ne doivent pas dépendre de la vue appelée.
"""

from collections import OrderedDict

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class PaginationStandard(PageNumberPagination):
    """Pagination par numéro de page, taille surchargeable par le client.

    Exemple : `GET /api/demandes/?page=2&taille=50`.
    """

    page_size = 20
    page_size_query_param = "taille"
    max_page_size = 200
    page_query_param = "page"

    def get_paginated_response(self, data):
        return Response(
            OrderedDict(
                [
                    ("total", self.page.paginator.count),
                    ("nombre_pages", self.page.paginator.num_pages),
                    ("page_courante", self.page.number),
                    ("taille_page", self.get_page_size(self.request)),
                    ("suivante", self.get_next_link()),
                    ("precedente", self.get_previous_link()),
                    ("resultats", data),
                ]
            )
        )
