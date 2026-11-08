# Journalise explicitement les demandes saisies par le chef pour un agent sans signature.
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("conges", "0008_alter_decisionconge_indice_code"),
    ]

    operations = [
        migrations.AlterField(
            model_name="tracesignature",
            name="evenement",
            field=models.CharField(
                max_length=40,
                choices=[
                    ("SIGNATURE_AGENT_ENREGISTREE", "Signature du demandeur enregistrée"),
                    ("SIGNATURE_AGENT_RECONCILIEE", "Journal de signature initialisé pour une demande préexistante"),
                    ("DEMANDE_SAISIE_DELEGUEE", "Demande saisie par le chef pour un agent"),
                    ("PDF_OFFICIEL_SCELE", "Document officiel scellé"),
                    ("PDF_OFFICIEL_TELECHARGE", "Document officiel téléchargé"),
                ],
            ),
        ),
    ]
