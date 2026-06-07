from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("schemas", "0002_expand_schema_icon"),
    ]

    operations = [
        migrations.AddField(
            model_name="dataschema",
            name="label_print_config",
            field=models.JSONField(default=dict),
        ),
    ]
