from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .governance_api import (
    get_schema_version_payload,
    get_visible_schema,
    list_schema_versions_payload,
    reorder_schema_fields,
)
from .permissions import can_change_schema
from .serializers import DataSchemaSerializer
from .services import audit_schema_action


@api_view(["GET"])
def schema_versions_view(request, schema_id: int):
    schema = get_visible_schema(request.user, schema_id)
    return Response(list_schema_versions_payload(schema))


@api_view(["GET"])
def schema_version_detail_view(request, schema_id: int, version: int):
    schema = get_visible_schema(request.user, schema_id)
    return Response(get_schema_version_payload(schema, version))


@api_view(["POST"])
def reorder_schema_fields_view(request, schema_id: int):
    schema = get_visible_schema(request.user, schema_id)
    if not can_change_schema(request.user, schema):
        raise PermissionDenied("you do not have schema change permission")
    reordered_schema = reorder_schema_fields(
        schema,
        request.user,
        request.data.get("field_keys") if isinstance(request.data, dict) else None,
    )
    audit_schema_action(
        request,
        "schema.reorder_fields",
        reordered_schema,
        {
            "field_keys": [field["key"] for field in reordered_schema.fields_config],
            "version": reordered_schema.current_version,
        },
    )
    return Response(DataSchemaSerializer(reordered_schema, context={"request": request}).data)
