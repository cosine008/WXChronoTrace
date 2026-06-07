from __future__ import annotations

import time

from django.core.management.base import BaseCommand, CommandError

from apps.stats.export_job_worker import process_export_jobs


class Command(BaseCommand):
    help = "Process queued export jobs and optionally clean expired files."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=10, help="Max queued jobs to process per run.")
        parser.add_argument("--once", action="store_true", help="Run one iteration and exit.")
        parser.add_argument("--loop", action="store_true", help="Keep polling until interrupted.")
        parser.add_argument("--sleep", type=float, default=5.0, help="Sleep seconds between loop iterations.")
        parser.add_argument(
            "--cleanup-expired",
            action="store_true",
            dest="cleanup_expired",
            help="Delete expired completed export files before processing queued jobs.",
        )

    def handle(self, *args, **options):
        limit = options["limit"]
        sleep_seconds = options["sleep"]
        if limit < 0:
            raise CommandError("--limit must be >= 0")
        if sleep_seconds < 0:
            raise CommandError("--sleep must be >= 0")
        if options["once"] and options["loop"]:
            raise CommandError("--once and --loop cannot be used together")

        run_once = options["once"] or not options["loop"]
        try:
            while True:
                summary = process_export_jobs(
                    limit=limit,
                    cleanup_expired=options["cleanup_expired"],
                )
                self.stdout.write(self.style.SUCCESS(_format_summary(summary)))
                if run_once:
                    return
                time.sleep(sleep_seconds)
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("process_export_jobs stopped"))


def _format_summary(summary: dict[str, int]) -> str:
    return (
        "processed={processed} failed={failed} stale_failed={stale_failed} expired={expired}".format(
            **summary
        )
    )
