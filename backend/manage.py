#!/usr/bin/env python
"""Entrée Django : les tests utilisent toujours des réglages isolés."""

import os
import sys


def main():
    commande = sys.argv[1] if len(sys.argv) > 1 else ""
    parametres_explicites = any(
        argument == "--settings" or argument.startswith("--settings=")
        for argument in sys.argv[2:]
    )

    if commande == "test" and not parametres_explicites:
        # Force une base SQLite en mémoire, un cache isolé et l'absence de throttling
        # pour les tests, même si DJANGO_SETTINGS_MODULE=dev a été défini dans le shell.
        os.environ["DJANGO_SETTINGS_MODULE"] = os.environ.get(
            "DJANGO_TEST_SETTINGS_MODULE", "config.settings.test"
        )
    elif "DJANGO_SETTINGS_MODULE" not in os.environ:
        os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings.dev"

    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
