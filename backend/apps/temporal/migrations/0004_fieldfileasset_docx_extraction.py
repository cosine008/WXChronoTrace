from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("temporal", "0003_fieldfileasset"),
    ]

    operations = [
        migrations.AddField(
            model_name="fieldfileasset",
            name="extracted_text",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="fieldfileasset",
            name="extracted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="fieldfileasset",
            name="extraction_status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("ready", "Ready"),
                    ("unsupported", "Unsupported"),
                    ("failed", "Failed"),
                ],
                default="unsupported",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="fieldfileasset",
            name="extraction_error",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="fieldfileasset",
            name="extraction_truncated",
            field=models.BooleanField(default=False),
        ),
    ]
