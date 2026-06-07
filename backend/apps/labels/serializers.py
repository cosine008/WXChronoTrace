from rest_framework import serializers


class LabelCreateSerializer(serializers.Serializer):
    template_code = serializers.CharField(required=False, max_length=64)
    replace_existing_active = serializers.BooleanField(required=False, default=False)
    reason = serializers.CharField(required=False, allow_blank=True, default="", max_length=500)


class LabelBulkCreateSerializer(serializers.Serializer):
    entity_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
    )
    template_code = serializers.CharField(required=False, max_length=64)
    skip_existing_active = serializers.BooleanField(required=False, default=True)
    create_missing = serializers.BooleanField(required=False, default=True)


class LabelReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(required=True, allow_blank=False, max_length=500)


class LabelReplaceSerializer(LabelReasonSerializer):
    template_code = serializers.CharField(required=False, max_length=64)


class LabelPrintSerializer(serializers.Serializer):
    format = serializers.ChoiceField(required=False, default="svg", choices=["svg"])
    template_code = serializers.CharField(required=False, max_length=64)


class LabelPreviewSerializer(LabelPrintSerializer):
    label_print_config = serializers.JSONField(required=False)


class LabelSheetPrintSerializer(serializers.Serializer):
    format = serializers.ChoiceField(required=False, default="svg", choices=["svg"])
    template_code = serializers.CharField(required=False, default="a4_grid", max_length=64)
    label_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=False,
        max_length=100,
    )
