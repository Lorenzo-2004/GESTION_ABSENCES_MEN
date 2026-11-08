# Generated as the single migration for the alphanumeric decision index.
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("conges", "0007_tracesignature_signature_agent_reconciliee")]

    operations = [
        migrations.AlterField(
            model_name="decisionconge",
            name="indice",
            field=models.CharField(blank=True, max_length=30, null=True),
        ),
    ]
