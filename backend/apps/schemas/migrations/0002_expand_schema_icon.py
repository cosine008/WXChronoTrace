from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("schemas", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="dataschema",
            name="icon",
            field=models.TextField(blank=True),
        ),
    ]
