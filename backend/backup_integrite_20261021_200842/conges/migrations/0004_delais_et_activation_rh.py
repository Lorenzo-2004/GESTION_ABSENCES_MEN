from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("conges", "0003_demandeabsence_annee_titre")]

    operations = [
        migrations.AddField(
            model_name="demandeabsence",
            name="date_evenement_prevue",
            field=models.DateField(
                blank=True,
                help_text=(
                    "Date prévue de l'accouchement, obligatoire pour contrôler les délais "
                    "des demandes de maternité et de paternité (RG-11)."
                ),
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="decisionconge",
            name="est_valide",
            field=models.BooleanField(default=False),
        ),
    ]
