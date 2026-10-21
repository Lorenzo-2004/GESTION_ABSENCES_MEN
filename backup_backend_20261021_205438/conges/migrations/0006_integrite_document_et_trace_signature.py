# Generated for the sealed official PDF and append-only signature audit trail.
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("conges", "0005_signature_demande_avant_soumission"),
    ]

    operations = [
        migrations.AddField(
            model_name="demandeabsence",
            name="pdf_officiel",
            field=models.FileField(blank=True, editable=False, null=True, upload_to="formulaires_signatures/"),
        ),
        migrations.AddField(
            model_name="demandeabsence",
            name="pdf_officiel_sha256",
            field=models.CharField(blank=True, editable=False, max_length=64),
        ),
        migrations.AddField(
            model_name="demandeabsence",
            name="pdf_officiel_genere_le",
            field=models.DateTimeField(blank=True, editable=False, null=True),
        ),
        migrations.AddField(
            model_name="demandeabsence",
            name="pdf_officiel_genere_par",
            field=models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="formulaires_officiels_sceles", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="demandeabsence",
            name="signature_audit_dernier_hash",
            field=models.CharField(blank=True, editable=False, max_length=64),
        ),
        migrations.CreateModel(
            name="TraceSignature",
            fields=[
                ("id_trace", models.BigAutoField(primary_key=True, serialize=False)),
                ("evenement", models.CharField(choices=[("SIGNATURE_AGENT_ENREGISTREE", "Signature du demandeur enregistrée"), ("PDF_OFFICIEL_SCELE", "Document officiel scellé"), ("PDF_OFFICIEL_TELECHARGE", "Document officiel téléchargé")], max_length=40)),
                ("date_evenement", models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ("acteur_id_snapshot", models.PositiveBigIntegerField(blank=True, editable=False, null=True)),
                ("acteur_identifiant", models.CharField(default="système", editable=False, max_length=150)),
                ("signature_sha256", models.CharField(blank=True, editable=False, max_length=64)),
                ("pdf_sha256", models.CharField(blank=True, editable=False, max_length=64)),
                ("empreinte_precedente", models.CharField(blank=True, editable=False, max_length=64)),
                ("empreinte_evenement", models.CharField(editable=False, max_length=64, unique=True)),
                ("details", models.JSONField(blank=True, default=dict, editable=False)),
                ("acteur", models.ForeignKey(blank=True, editable=False, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="traces_signature_effectuees", to=settings.AUTH_USER_MODEL)),
                ("demande", models.ForeignKey(db_column="id_demande", on_delete=django.db.models.deletion.PROTECT, related_name="traces_signature", to="conges.demandeabsence")),
            ],
            options={"db_table": "traces_signature", "ordering": ["id_trace"]},
        ),
        migrations.AddIndex(
            model_name="tracesignature",
            index=models.Index(fields=["demande", "date_evenement"], name="idx_trace_sig_demande_date"),
        ),
    ]
