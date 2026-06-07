"""M7-prep · CSV 批量导入用户的命令测试。"""
from io import StringIO

import pytest
from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts.models import UserProfile


def _write_csv(tmp_path, rows: list[str]) -> str:
    path = tmp_path / "users.csv"
    path.write_text("\n".join(rows) + "\n", encoding="utf-8")
    return str(path)


@pytest.mark.django_db
def test_import_users_creates_users_and_profiles(tmp_path):
    csv_path = _write_csv(
        tmp_path,
        [
            "username,password,email,display_name,is_superuser",
            "alice,pw-Strong-1,alice@example.com,Alice,false",
            "admin,pw-Strong-2,admin@example.com,管理员,true",
        ],
    )
    out = StringIO()

    call_command("import_users", csv_path, stdout=out)

    assert User.objects.filter(username="alice").exists()
    admin = User.objects.get(username="admin")
    assert admin.is_superuser is True
    assert UserProfile.objects.get(user__username="alice").display_name == "Alice"
    assert "created=2" in out.getvalue()


@pytest.mark.django_db
def test_import_users_skips_existing_without_update_flag(tmp_path):
    User.objects.create_user(username="alice", password="old-pw")
    csv_path = _write_csv(
        tmp_path,
        ["username,password,email", "alice,new-pw,alice@example.com"],
    )
    out = StringIO()

    call_command("import_users", csv_path, stdout=out)

    alice = User.objects.get(username="alice")
    assert alice.check_password("old-pw")
    assert alice.email == ""
    assert "skipped=1" in out.getvalue()


@pytest.mark.django_db
def test_import_users_update_flag_updates_email_and_display_name(tmp_path):
    user = User.objects.create_user(username="alice", password="old-pw")
    UserProfile.objects.create(user=user, display_name="旧名")
    csv_path = _write_csv(
        tmp_path,
        ["username,password,email,display_name", "alice,ignored,alice@example.com,新名"],
    )
    out = StringIO()

    call_command("import_users", csv_path, "--update", stdout=out)

    alice = User.objects.get(username="alice")
    assert alice.email == "alice@example.com"
    assert alice.check_password("old-pw")  # 密码不被覆写
    assert UserProfile.objects.get(user=alice).display_name == "新名"
    assert "updated=1" in out.getvalue()


@pytest.mark.django_db
def test_import_users_missing_required_column_raises(tmp_path):
    csv_path = _write_csv(tmp_path, ["username,email", "alice,a@example.com"])

    with pytest.raises(CommandError, match="缺少必需列"):
        call_command("import_users", csv_path)


@pytest.mark.django_db
def test_import_users_dry_run_does_not_write(tmp_path):
    csv_path = _write_csv(
        tmp_path,
        ["username,password", "alice,pw-Strong-1"],
    )
    out = StringIO()

    call_command("import_users", csv_path, "--dry-run", stdout=out)

    assert not User.objects.filter(username="alice").exists()
    assert "[dry-run]" in out.getvalue()
