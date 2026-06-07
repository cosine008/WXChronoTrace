from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .admin_api import list_admin_schema_ledger_payload


@api_view(["GET"])
def admin_schema_ledger_view(request):
    if not request.user.is_superuser:
        raise PermissionDenied("only system administrators can view the global schema ledger")
    return Response(list_admin_schema_ledger_payload(request.query_params))
