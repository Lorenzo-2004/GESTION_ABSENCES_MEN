# Ajoute un événement explicite pour initialiser l'audit des demandes déjà signées.
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("conges", "0006_integrite_document_et_trace_signature"),
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
                    ("PDF_OFFICIEL_SCELE", "Document officiel scellé"),
                    ("PDF_OFFICIEL_TELECHARGE", "Document officiel téléchargé"),
                ],
            ),
        ),
    ]
