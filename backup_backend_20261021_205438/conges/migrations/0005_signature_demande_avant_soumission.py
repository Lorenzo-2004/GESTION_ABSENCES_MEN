# Generated for the signature field captured before a leave request is submitted.
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("conges", "0004_delais_et_activation_rh"),
    ]

    operations = [
        migrations.AddField(
            model_name="demandeabsence",
            name="signature_agent",
            field=models.FileField(blank=True, editable=False, null=True, upload_to="signatures_demandes/"),
        ),
        migrations.AddField(
            model_name="demandeabsence",
            name="date_signature_agent",
            field=models.DateTimeField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name="demandeabsence",
            name="signature_agent_sha256",
            field=models.CharField(blank=True, editable=False, max_length=64),
        ),
        migrations.AddField(
            model_name="demandeabsence",
            name="signature_agent_compte",
            field=models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="demandes_signees_a_la_soumission", to=settings.AUTH_USER_MODEL),
        ),
    ]
