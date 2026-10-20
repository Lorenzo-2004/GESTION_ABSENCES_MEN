from django.db import models


class Direction(models.Model):
    id_direction = models.BigAutoField(primary_key=True)
    code_direction = models.CharField(max_length=20, unique=True)
    nom_direction = models.CharField(max_length=200)

    class Meta:
        db_table = "directions"
        ordering = ["code_direction"]

    def __str__(self):
        return f"{self.code_direction} - {self.nom_direction}"

    def get_services(self):
        return self.services.all()

    def get_personnels(self):
        return self.personnels.all()


class Service(models.Model):
    id_service = models.BigAutoField(primary_key=True)
    code_service = models.CharField(max_length=20)
    nom_service = models.CharField(max_length=200)
    direction = models.ForeignKey(
        Direction,
        on_delete=models.PROTECT,
        related_name="services",
        db_column="id_direction",
    )

    class Meta:
        db_table = "services"
        ordering = ["direction", "code_service"]
        constraints = [
            models.UniqueConstraint(
                fields=["direction", "code_service"], name="uniq_service_par_direction"
            )
        ]

    def __str__(self):
        return f"{self.code_service} - {self.nom_service}"

    def get_personnels(self):
        return self.personnels.all()
