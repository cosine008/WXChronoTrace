from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("schemas", "0003_dataschema_label_print_config"),
    ]

    operations = [
        migrations.AlterField(
            model_name="dataschema",
            name="period_unit",
            field=models.CharField(
                blank=True,
                choices=[
                    ("day", "日"),
                    ("week", "周"),
                    ("month", "月"),
                    ("quarter", "季"),
                    ("half_year", "半年"),
                    ("year", "年"),
                ],
                max_length=20,
                null=True,
            ),
        ),
    ]
