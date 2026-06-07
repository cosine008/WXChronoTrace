"""批量创建账号。

CSV 列：username, password, email(可选), display_name(可选), is_superuser(可选 true/false)。
首行必须是表头。已存在的 username 默认跳过；--update 则更新 email / display_name（不改密码）。
"""
from __future__ import annotations

import csv
from pathlib import Path

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import UserProfile

REQUIRED_COLS = {"username", "password"}
ALLOWED_COLS = REQUIRED_COLS | {"email", "display_name", "is_superuser"}


class Command(BaseCommand):
    help = "从 CSV 批量创建账号。表头必须包含 username/password。"

    def add_arguments(self, parser):
        parser.add_argument("csv_path", help="CSV 文件路径")
        parser.add_argument(
            "--update",
            action="store_true",
            help="已存在的用户更新 email / display_name（不重置密码）",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="只校验和报告，不写库",
        )

    def handle(self, *args, **options):
        path = Path(options["csv_path"])
        if not path.exists():
            raise CommandError(f"CSV 文件不存在：{path}")

        with path.open("r", encoding="utf-8-sig", newline="") as fp:
            reader = csv.DictReader(fp)
            if reader.fieldnames is None:
                raise CommandError("CSV 缺少表头")
            cols = set(reader.fieldnames)
            missing = REQUIRED_COLS - cols
            if missing:
                raise CommandError(f"缺少必需列：{', '.join(sorted(missing))}")
            unknown = cols - ALLOWED_COLS
            if unknown:
                self.stdout.write(self.style.WARNING(f"忽略未知列：{', '.join(sorted(unknown))}"))
            rows = list(reader)

        created, updated, skipped = 0, 0, 0
        errors: list[str] = []

        for line_no, row in enumerate(rows, start=2):  # +1 for header
            username = (row.get("username") or "").strip()
            password = row.get("password") or ""
            if not username or not password:
                errors.append(f"第 {line_no} 行：username/password 不能为空")
                continue
            email = (row.get("email") or "").strip()
            display_name = (row.get("display_name") or "").strip()
            is_superuser = (row.get("is_superuser") or "").strip().lower() in {"1", "true", "yes"}

            try:
                with transaction.atomic():
                    user = User.objects.filter(username=username).first()
                    if user is not None:
                        if not options["update"]:
                            skipped += 1
                            continue
                        if email:
                            user.email = email
                        user.save(update_fields=["email"])
                        profile, _ = UserProfile.objects.get_or_create(user=user)
                        if display_name:
                            profile.display_name = display_name
                            profile.save(update_fields=["display_name"])
                        updated += 1
                    else:
                        if options["dry_run"]:
                            created += 1
                            continue
                        if is_superuser:
                            user = User.objects.create_superuser(
                                username=username, email=email, password=password
                            )
                        else:
                            user = User.objects.create_user(
                                username=username, email=email, password=password
                            )
                        UserProfile.objects.create(user=user, display_name=display_name)
                        created += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(f"第 {line_no} 行（{username}）：{exc}")

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("[dry-run] 未写库"))
        self.stdout.write(
            self.style.SUCCESS(
                f"完成：created={created} updated={updated} skipped={skipped} errors={len(errors)}"
            )
        )
        for err in errors:
            self.stdout.write(self.style.ERROR(err))
        if errors and not options["dry_run"]:
            raise CommandError(f"{len(errors)} 行失败，请修正后重跑")
